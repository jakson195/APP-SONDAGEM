import asyncio
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.state import state

router = APIRouter()

_connections: set[WebSocket] = set()


async def broadcast(message: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    for ws in _connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections.discard(ws)


@router.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    await ws.accept()
    _connections.add(ws)
    try:
        await ws.send_json(
            {
                "type": "dashboard",
                "payload": state.dashboard().model_dump(mode="json"),
            }
        )
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=5.0)
                if raw.strip().lower() == "ping":
                    await ws.send_json({"type": "ping", "payload": {"ok": True}})
            except asyncio.TimeoutError:
                state.tick_live()
                await ws.send_json(
                    {
                        "type": "dashboard",
                        "payload": state.dashboard().model_dump(mode="json"),
                    }
                )
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(ws)


async def push_alert_broadcast(alert: dict) -> None:
    await broadcast({"type": "alert", "payload": alert})
