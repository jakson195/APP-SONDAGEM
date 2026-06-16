from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/")
def search(q: str = Query(..., min_length=2)):
    return {"query": q, "results": [], "message": "Busca rio/município — fase 2"}
