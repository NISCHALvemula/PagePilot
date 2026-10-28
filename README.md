# PagePilot

**PagePilot: An ML-Assisted Virtual Memory Management System with Intelligent Page Replacement**

An educational simulator for FIFO, LRU, Optimal, Clock, and an ML-assisted eviction policy. It visualizes page faults and hits, compares algorithms on identical traces, and generates reproducible workloads.

> This is a simulator, not a replacement for the memory manager in a real operating-system kernel. The ML policy is experimental and is not guaranteed to outperform conventional algorithms.

## Features

- Step-by-step memory frame visualization.
- FIFO, LRU, Optimal, Clock, and ML-assisted replacement.
- Comparison chart and CSV export.
- Synthetic sequential, looping, locality-heavy, random, and phase-change traces.
- A small logistic scoring model trained on synthetic candidate examples labelled by an offline Optimal-policy teacher.
- FastAPI endpoints and pytest tests.
- Vercel configuration for the React frontend and Python API.

## Run locally (Windows PowerShell)

Requirements: Python 3.11+ and Node.js 20+.

```powershell
cd pagepilot
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install pytest uvicorn
npm install
```

Terminal 1 — API:

```powershell
uvicorn backend.main:app --reload
```

Terminal 2 — frontend:

```powershell
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`.

The API docs are available at `http://127.0.0.1:8000/docs`.

## Test and build

```powershell
python -m pytest -q
npm run build
```

## Deploy to Vercel

1. Create a GitHub repository and push this folder.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the root directory at the repository root.
3. Vercel should detect `vercel.json`. The frontend build command is `npm run build`; output directory is `dist`.
4. Deploy, then open `/api/health` on your deployed domain to check the API.

The app does not require secrets or a database. Vercel deployment behavior can change, so if the Python function does not route correctly, inspect the deployment logs and current Vercel Python runtime documentation before changing the routing configuration.

## API

- `GET /api/health`
- `POST /api/simulate` — `{ "trace": [7,0,1,2], "frames": 3, "algorithm": "lru" }`
- `POST /api/compare` — `{ "trace": [7,0,1,2], "frames": 3 }`
- `POST /api/workload` — `{ "kind": "locality", "length": 80, "seed": 42 }`

## ML methodology and limitations

The ML model is a lightweight logistic scoring model implemented in Python's standard library. It is trained on synthetic traces, with an offline Optimal-policy teacher assigning candidate-victim labels. Prediction features are calculated from the access history available at the decision point. Future references are used by the teacher to create labels but are not passed to the predictor.

This is a compact educational baseline, not evidence that learned replacement is superior. The synthetic workload generator, label strategy, and feature set constrain generalization. Compare it empirically with FIFO, LRU, Clock, and Optimal on held-out traces before drawing conclusions.
