# Mothusi backend

## Run locally

From this directory, start the API with:

```powershell
$env:MOTHUSI_DEMO_MODE = "true"
python -m uvicorn api:app --reload
```

The demo mode returns clearly labelled sample adaptations and does not call an AI
provider. To use the CrewAI workflow instead, install the project dependencies,
set `NVIDIA_API_KEY` in the environment, and run Uvicorn without demo mode:

```powershell
python -m pip install -e .
$env:NVIDIA_API_KEY = "your-key"
python -m uvicorn api:app --reload
```

The API listens on `http://127.0.0.1:8000`. Check `/api/health` for status.
Lesson generation is available at `POST /api/lessons/generate`.