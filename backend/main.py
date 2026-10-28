from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .simulator import compare, generate_trace, simulate

app = FastAPI(title="PagePilot API", version="1.0.0", description="OS page-replacement simulator with ML-assisted eviction.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

class SimulationRequest(BaseModel):
    trace: list[int] = Field(min_length=1, max_length=500)
    frames: int = Field(default=3, ge=1, le=32)
    algorithm: str = "lru"

class CompareRequest(BaseModel):
    trace: list[int] = Field(min_length=1, max_length=500)
    frames: int = Field(default=3, ge=1, le=32)

class WorkloadRequest(BaseModel):
    kind: str = "locality"
    length: int = Field(default=80, ge=1, le=500)
    seed: int = Field(default=42, ge=0, le=1_000_000)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PagePilot API", "ml_model": "trained synthetic Optimal-teacher logistic scorer"}

@app.post("/api/simulate")
def run_simulation(request: SimulationRequest):
    try:
        return simulate(request.trace, request.frames, request.algorithm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/compare")
def compare_algorithms(request: CompareRequest):
    try:
        return compare(request.trace, request.frames)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.post("/api/workload")
def workload(request: WorkloadRequest):
    try:
        trace = generate_trace(request.kind, request.length, request.seed)
        return {"kind": request.kind, "length": len(trace), "seed": request.seed, "trace": trace}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
