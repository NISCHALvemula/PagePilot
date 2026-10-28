"""Page-replacement algorithms and a lightweight ML-assisted eviction policy."""
from __future__ import annotations

import math
import random
from collections import Counter, deque
from typing import Callable


def _features(page: int, trace: list[int], index: int, frames: list[int]) -> list[float]:
    """Features available at the current decision; never reads future accesses."""
    history = trace[:index]
    positions = [i for i, value in enumerate(history) if value == page]
    recency = index - positions[-1] if positions else index + 1
    recent = history[max(0, index - 8):]
    recent_frequency = sum(value == page for value in recent)
    total_frequency = len(positions)
    resident_position = 0
    # Candidate position provides a small deterministic tie-breaking signal.
    for value in frames:
        if value == page:
            break
        resident_position += 1
    return [float(min(recency, 100)), float(recent_frequency), float(total_frequency), float(resident_position)]


def _optimal_victim(frames: list[int], trace: list[int], index: int) -> int:
    future = trace[index + 1:]
    next_use = {}
    for page in frames:
        try:
            next_use[page] = future.index(page)
        except ValueError:
            next_use[page] = math.inf
    return max(frames, key=lambda page: next_use[page])


def _synthetic_training_rows(seed: int = 17) -> tuple[list[list[float]], list[int]]:
    """Create candidate-level examples labelled by an offline Optimal teacher."""
    rng = random.Random(seed)
    rows: list[list[float]] = []
    labels: list[int] = []
    for _ in range(220):
        kind = rng.randrange(4)
        if kind == 0:
            trace = [i % 6 for i in range(90)]
        elif kind == 1:
            trace = [rng.randrange(5) if rng.random() < .8 else rng.randrange(12) for _ in range(90)]
        elif kind == 2:
            trace = [rng.randrange(10) for _ in range(90)]
        else:
            trace = [([0, 1, 2, 3, 4][i % 5] if i < 45 else [5, 6, 7, 8, 9][i % 5]) for i in range(90)]
        capacity = rng.randint(2, 5)
        frames: list[int] = []
        for i, page in enumerate(trace):
            if page in frames:
                continue
            if len(frames) < capacity:
                frames.append(page)
                continue
            victim = _optimal_victim(frames, trace, i)
            for candidate in frames:
                rows.append(_features(candidate, trace, i, frames))
                labels.append(1 if candidate == victim else 0)
            frames[frames.index(victim)] = page
    return rows, labels


class EvictionModel:
    """Small logistic model trained on synthetic Optimal-teacher examples."""
    def __init__(self) -> None:
        rows, labels = _synthetic_training_rows()
        self.mean = [sum(row[j] for row in rows) / len(rows) for j in range(4)]
        self.scale = [max(1.0, (sum((row[j] - self.mean[j]) ** 2 for row in rows) / len(rows)) ** .5) for j in range(4)]
        self.weights = [0.0] * 4
        self.bias = 0.0
        # Batch-free logistic SGD: intentionally tiny so serverless cold starts stay light.
        rng = random.Random(29)
        order = list(range(len(rows)))
        for epoch in range(18):
            rng.shuffle(order)
            rate = .06 / (1 + epoch * .08)
            for i in order:
                x = [(rows[i][j] - self.mean[j]) / self.scale[j] for j in range(4)]
                z = max(-20.0, min(20.0, self.bias + sum(a * b for a, b in zip(self.weights, x))))
                pred = 1.0 / (1.0 + math.exp(-z))
                error = labels[i] - pred
                for j in range(4):
                    self.weights[j] += rate * (error * x[j] - .002 * self.weights[j])
                self.bias += rate * error

    def score(self, features: list[float]) -> float:
        x = [(features[j] - self.mean[j]) / self.scale[j] for j in range(4)]
        z = max(-20.0, min(20.0, self.bias + sum(a * b for a, b in zip(self.weights, x))))
        return 1.0 / (1.0 + math.exp(-z))

    def predict_victim(self, frames: list[int], trace: list[int], index: int) -> tuple[int, dict[str, float]]:
        scores = {page: self.score(_features(page, trace, index, frames)) for page in frames}
        # If the model is indecisive, use LRU as a deterministic safety fallback.
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        if not ranked or max(scores.values()) - min(scores.values()) < 1e-8:
            history = trace[:index]
            victim = min(frames, key=lambda p: max((i for i, v in enumerate(history) if v == p), default=-1))
        else:
            victim = ranked[0][0]
        return victim, scores


# Train once per Python process; no heavyweight ML framework or external model download.
ML_MODEL = EvictionModel()


def simulate(trace: list[int], capacity: int, algorithm: str) -> dict:
    if not trace:
        raise ValueError("Reference string must contain at least one page.")
    if capacity < 1 or capacity > 32:
        raise ValueError("Frame capacity must be between 1 and 32.")
    if any(not isinstance(page, int) or page < 0 or page > 1_000_000 for page in trace):
        raise ValueError("Page IDs must be non-negative integers up to 1,000,000.")
    algorithm = algorithm.lower()
    if algorithm not in {"fifo", "lru", "optimal", "clock", "ml"}:
        raise ValueError(f"Unsupported algorithm: {algorithm}")

    frames: list[int] = []
    queue: deque[int] = deque()
    last_used: dict[int, int] = {}
    ref_bits: dict[int, int] = {}
    hand = 0
    hits = faults = 0
    steps = []

    for i, page in enumerate(trace):
        hit = page in frames
        evicted = None
        scores = None
        if hit:
            hits += 1
            if algorithm == "lru":
                last_used[page] = i
            if algorithm == "clock":
                ref_bits[page] = 1
        else:
            faults += 1
            if len(frames) < capacity:
                frames.append(page)
                queue.append(page)
                ref_bits[page] = 1
                last_used[page] = i
            else:
                if algorithm == "fifo":
                    evicted = queue.popleft()
                    frames[frames.index(evicted)] = page
                    queue.append(page)
                elif algorithm == "lru":
                    evicted = min(frames, key=lambda p: last_used.get(p, -1))
                    frames[frames.index(evicted)] = page
                    last_used.pop(evicted, None)
                    last_used[page] = i
                elif algorithm == "optimal":
                    evicted = _optimal_victim(frames, trace, i)
                    frames[frames.index(evicted)] = page
                elif algorithm == "ml":
                    evicted, scores = ML_MODEL.predict_victim(frames, trace, i)
                    frames[frames.index(evicted)] = page
                elif algorithm == "clock":
                    while True:
                        candidate = frames[hand]
                        if ref_bits.get(candidate, 0) == 0:
                            evicted = candidate
                            frames[hand] = page
                            hand = (hand + 1) % capacity
                            break
                        ref_bits[candidate] = 0
                        hand = (hand + 1) % capacity
                    ref_bits.pop(evicted, None)
                    ref_bits[page] = 1
            if algorithm == "clock" and page not in ref_bits:
                ref_bits[page] = 1
        if algorithm == "lru":
            last_used[page] = i
        if algorithm == "clock":
            ref_bits[page] = 1
        steps.append({
            "index": i, "page": page, "hit": hit, "fault": not hit,
            "frames": frames.copy(), "evicted": evicted,
            "reason": (f"Page {evicted} was selected for eviction." if evicted is not None else ("Page already in RAM." if hit else "An empty frame was available.")),
            "scores": ({str(k): round(v, 4) for k, v in scores.items()} if scores else None),
            "hits": hits, "faults": faults,
        })
    return {
        "algorithm": algorithm, "capacity": capacity, "trace": trace,
        "steps": steps, "hits": hits, "faults": faults,
        "hit_rate": round(hits / len(trace), 4),
        "fault_rate": round(faults / len(trace), 4),
        "evictions": sum(step["evicted"] is not None for step in steps),
    }


def compare(trace: list[int], capacity: int, algorithms: list[str] | None = None) -> list[dict]:
    selected = algorithms or ["fifo", "lru", "optimal", "clock", "ml"]
    return [simulate(trace, capacity, algorithm) for algorithm in selected]


def generate_trace(kind: str, length: int = 80, seed: int = 42) -> list[int]:
    if not 1 <= length <= 500:
        raise ValueError("Trace length must be between 1 and 500.")
    rng = random.Random(seed)
    if kind == "sequential":
        return [i % 12 for i in range(length)]
    if kind == "looping":
        pattern = [1, 2, 3, 4, 2, 3, 5]
        return [pattern[i % len(pattern)] for i in range(length)]
    if kind == "locality":
        hot = [0, 1, 2, 3, 4]
        return [rng.choice(hot if rng.random() < .85 else list(range(5, 16))) for _ in range(length)]
    if kind == "phase-change":
        return [rng.randrange(5) if i < length // 2 else rng.randrange(5, 10) for i in range(length)]
    if kind == "random":
        return [rng.randrange(16) for _ in range(length)]
    raise ValueError("Unknown workload type.")
