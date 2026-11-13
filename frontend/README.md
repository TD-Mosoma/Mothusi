# Mothusi frontend

## Run locally

Start the backend in one terminal:

```powershell
cd backend
copy .env.example .env
uv sync
uv run uvicorn main:app --reload --port 8000
```

Then start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` requests to the backend.
Without an NVIDIA API key, the backend uses its clearly labelled offline demo model.
See [`../backend/README.md`](../backend/README.md) for the API endpoints.

- `/` role picker, `/learner` sky blue + white, `/teacher` grey + white
- Tokens: `src/styles/tokens.css` (change colours here only)
- Lesson planning and learner content use the FastAPI backend through `src/services/api.js`. Teacher workspace data remains stored in the browser.
- Only English lesson text exists. Add other languages to `lessonText` only after a speaker has reviewed them.
