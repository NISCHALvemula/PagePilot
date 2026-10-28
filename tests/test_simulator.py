import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.simulator import compare, generate_trace, simulate

TRACE = [1, 2, 3, 1, 4, 1, 2, 5]

def test_known_lru_example():
    result = simulate([1, 2, 3, 1, 4], 3, "lru")
    assert result["faults"] == 4
    assert result["hits"] == 1

def test_optimal_not_worse_than_lru_on_same_trace():
    rows = {r["algorithm"]: r for r in compare([7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2], 3)}
    assert rows["optimal"]["faults"] <= rows["lru"]["faults"]

def test_all_policies_produce_one_step_per_access():
    for algorithm in ("fifo", "lru", "optimal", "clock", "ml"):
        result = simulate(TRACE, 3, algorithm)
        assert len(result["steps"]) == len(TRACE)
        assert result["hits"] + result["faults"] == len(TRACE)

def test_workload_generation_is_reproducible():
    assert generate_trace("locality", 40, 42) == generate_trace("locality", 40, 42)

def test_invalid_capacity_is_rejected():
    try:
        simulate([1, 2], 0, "fifo")
        assert False, "Expected ValueError"
    except ValueError:
        pass
