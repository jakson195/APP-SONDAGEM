# HidroAlerta — Backend

API FastAPI + Celery para ingestão ANA/OpenMeteo e dashboard em tempo real.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/api/v1/dashboard` | Snapshot completo do dashboard |
| POST | `/api/v1/dashboard/tick` | Simula tick live (dev) |
| GET | `/api/v1/stations` | Lista estações |
| GET | `/api/v1/forecast/level-series` | Série nível 48h |
| GET | `/api/v1/forecast/rain` | Previsão chuva 36h |
| GET | `/api/v1/alerts` | Alertas |
| PATCH | `/api/v1/alerts/{id}/read` | Marcar alerta lido |
| WS | `/api/v1/ws/live` | Push dashboard a cada 5s |
| POST | `/api/v1/ingestion/trigger` | Dispara ingestão manual |

## Desenvolvimento local

```bash
cd hidroalerta/backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Documentação interactiva: [http://localhost:8000/docs](http://localhost:8000/docs)

## Celery (opcional)

Com Redis a correr (`docker compose up redis` em `infra/`):

```bash
celery -A app.ingestion.celery_app.celery_app worker --loglevel=info
celery -A app.ingestion.celery_app.celery_app beat --loglevel=info
```

## Docker Compose (stack completa)

```bash
cd hidroalerta/infra
docker compose up --build
```
