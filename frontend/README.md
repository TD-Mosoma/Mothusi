# Mothusi frontend

## Run locally

Start the backend in one terminal:

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
uv sync
uv run uvicorn main:app --reload --port 8000
```

Then start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

In VS Code you can instead run the task **Mothusi: run everything** (Terminal → Run Task), which starts both.

Open `http://127.0.0.1:5173`. Vite forwards `/api` requests to the backend.
Without an NVIDIA API key, the backend uses its clearly labelled offline demo model.
See [`../backend/README.md`](../backend/README.md) for the API endpoints.

- `/` role picker, `/learner` sky blue + white, `/teacher` grey + white
- Tokens: `src/styles/tokens.css` (change colours here only)
- Lesson planning and learner content use the FastAPI backend through `src/services/api.js`. Teacher workspace data remains stored in the browser.
- Learner material is translated by the Language Agent and back-checked; learners only see translations that pass the check.
