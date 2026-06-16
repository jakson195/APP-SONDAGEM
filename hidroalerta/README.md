# HidroAlerta

Sistema de previsão de enchentes — web, mobile e backend.

## Estrutura

```
hidroalerta/
├── frontend/     # React + Vite + Tailwind (dashboard)
├── backend/      # FastAPI + Celery
├── infra/        # Docker Compose (PostgreSQL, Redis, API, workers)
└── mobile/       # React Native + Expo (fase 2)
```

## Quick start

### 1. Backend

```bash
cd hidroalerta/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (ligado à API)

```bash
cd hidroalerta/frontend
copy .env.example .env.local
npm install
npm run dev
```

Abrir [http://localhost:5174](http://localhost:5174) — com `VITE_API_URL=http://localhost:8000` o dashboard usa WebSocket live.

Sem `.env.local`, o frontend continua em modo mock (intervalo 5 s).

### 3. Stack Docker (opcional)

```bash
cd hidroalerta/infra
docker compose up --build
```

## Variáveis de ambiente

**Frontend** (`frontend/.env.local`):

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/api/v1/ws/live
VITE_MAPBOX_TOKEN=pk...
```

**Backend** (`backend/.env`):

```env
CORS_ORIGINS=http://localhost:5174
REDIS_URL=redis://localhost:6379/0
```

## Próximos passos

1. Modelo LSTM PyTorch + MLflow
2. Integração real ANA HidroWeb (SOAP/CSV)
3. HEC-RAS Docker + tiles COG
4. PostgreSQL/PostGIS quando `USE_DATABASE=true`
5. App Expo + FCM

