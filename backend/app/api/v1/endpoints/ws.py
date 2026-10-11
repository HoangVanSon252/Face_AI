from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from app.core.config import settings
from app.crud import crud_attendance, crud_user
from app.database import SessionLocal
from app.models.course import Enrollment, EnrollmentStatusEnum
from app.models.user import RoleEnum
from app.services.connection_manager import connection_manager

router = APIRouter()


@router.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: int, token: str | None = None):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access" or not payload.get("jti"):
            raise JWTError("Invalid token type")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = crud_user.get_user(db, user_id)
        session = crud_attendance.get_session(db, session_id)
        if user is None or session is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        allowed = user.role == RoleEnum.ADMIN
        allowed = allowed or (user.role == RoleEnum.LECTURER and session.section.lecturer_id == user.id)
        if user.role == RoleEnum.STUDENT:
            allowed = db.query(Enrollment.id).filter(
                Enrollment.section_id == session.section_id,
                Enrollment.student_id == user.id,
                Enrollment.status == EnrollmentStatusEnum.ENROLLED,
            ).first() is not None
        if not allowed:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    finally:
        db.close()

    await connection_manager.connect(session_id, websocket)
    await connection_manager.broadcast(
        session_id,
        "session_status",
        {"session_id": session_id, "status": "connected"},
    )
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("event") == "ping":
                await websocket.send_json({"event": "pong", "payload": {"session_id": session_id}})
    except WebSocketDisconnect:
        connection_manager.disconnect(session_id, websocket)
