# Mothusi frontend

## Run locally

Start the backend in one PowerShell terminal:

```powershell
cd backend
python -m pip install fastapi uvicorn python-dotenv
$env:MOTHUSI_DEMO_MODE = "true"
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Then start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` requests to the backend.
Demo mode generates clearly labelled sample recommendations without an AI key.
For AI generation, follow the setup instructions in [`../backend/README.md`](../backend/README.md).

- `/` role picker, `/learner` sky blue + white, `/teacher` grey + white
- Tokens: `src/styles/tokens.css` (change colours here only)
- Lesson generation uses the FastAPI backend through `src/services/api.js`. Class, learner, and lesson workspace data is still seeded and stored in the browser.
- Only English lesson text exists. Add other languages to `lessonText` only after a speaker has reviewed them.
