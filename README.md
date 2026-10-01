# Fertilizer Recommendation Dashboard

A React + Flask rebuild of the original Streamlit dashboard. Same models,
same logic (fertilizer recommendation, confidence, top-3 alternatives,
dosage estimate, cost & sustainability comparison) — new interface, no
Streamlit.

```
fertilizer-app/
├── backend/            Flask API that serves the trained models
│   ├── app.py
│   ├── requirements.txt
│   └── models/          fertilizer_model_v2.pkl, dosage_model.pkl, encoders...
├── frontend/           React (Vite) single-page app
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       └── main.jsx
└── notebook/            original fertilizer_prediction.ipynb + datasets, for reference
```

## Requirements

- Python 3.10+ and `pip`
- Node.js 18+ and `npm`
- The saved models in `backend/models/` were trained with
  **scikit-learn 1.8.0** (pinned in `requirements.txt`). Pickled models can
  break or behave differently on other versions, so keep that pin.

## Run it locally

You need **two terminals** — one for the backend, one for the frontend.

### 1. Backend (Flask API) — Terminal 1

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

The API starts on **http://127.0.0.1:5000**. Leave this terminal running.

Quick check: open http://127.0.0.1:5000/api/options in a browser — you
should see the soil and crop type lists as JSON.

### 2. Frontend (React) — Terminal 2

```bash
cd frontend
npm install
npm run dev
```

Vite starts the app on **http://localhost:5173**. Open that URL in your
browser — the app fetches the soil/crop options from the backend, and every
"Get recommendation" click calls `POST /api/predict` on the Flask API.

During local dev, Vite proxies any `/api/...` request straight to
`http://127.0.0.1:5000` (see `frontend/vite.config.js`), so both servers
just need to be running — no other config required.

## How the pieces fit together

- **`backend/app.py`** loads `fertilizer_model_v2.pkl` (Random Forest
  classifier), `dosage_model.pkl` (Random Forest regressor), and the three
  label encoders exactly as `dashboard.py` did, and exposes three routes:
  - `GET /api/health` — simple liveness check
  - `GET /api/options` — soil types & crop types for the form dropdowns
  - `POST /api/predict` — takes soil/crop/temperature/humidity/moisture/N/P/K,
    returns the recommended fertilizer, confidence, top-3 alternatives,
    estimated dosage (kg/hectare), and the cost & environmental-impact
    comparison table.
- **`frontend/src/App.jsx`** is the whole UI: a field-conditions form on the
  left, results (recommendation, confidence, alternatives, dosage, cost
  table) on the right — all plain React state and `fetch`, no extra UI
  libraries.

## Building for production

```bash
cd frontend
npm run build
```

This outputs static files to `frontend/dist/`. Serve them with any static
host, and point `API_BASE` in `src/App.jsx` (or a reverse proxy) at wherever
you deploy the Flask API — Flask itself doesn't serve the frontend in this
setup, so in production you'd typically put both behind something like
Nginx, or serve `dist/` separately (Vercel, Netlify, etc.) with CORS enabled
on the Flask side (already on via `flask-cors`).

## Notes

- Only the `_v2` classifier/encoders plus `dosage_model.pkl` and
  `soil_encoder.pkl` are used by `app.py`. Older model files are not tracked
  in this repo.
- `.pkl` files can run arbitrary code when loaded, so only load model files
  from sources you trust.
- `notebook/` keeps the original `fertilizer_prediction.ipynb` and datasets
  purely for reference/reproducing the models — it isn't part of the running
  app.
- The old `dashboard.py` (Streamlit) is not included; everything it did now
  lives in `backend/app.py` + `frontend/src/App.jsx`.
