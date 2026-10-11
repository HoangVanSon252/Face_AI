from collections import defaultdict

from fastapi import WebSocket


class SessionConnectionManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, session_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[session_id].append(websocket)

    def disconnect(self, session_id: int, websocket: WebSocket) -> None:
        connections = self._connections.get(session_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._connections.pop(session_id, None)

    async def broadcast(self, session_id: int, event: str, payload: dict) -> None:
        stale: list[WebSocket] = []
        for websocket in list(self._connections.get(session_id, [])):
            try:
                await websocket.send_json({"event": event, "payload": payload})
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(session_id, websocket)


connection_manager = SessionConnectionManager()
