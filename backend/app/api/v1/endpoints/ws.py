from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.crud import crud_attendance, crud_user
from app.database import SessionLocal
from app.models.course import Enrollment, EnrollmentStatusEnum
from app.models.user import RoleEnum, UserStatusEnum
from app.services import token_store
from app.services.connection_manager import connection_manager

router = APIRouter()


@router.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: int, ticket: str | None = None):
    # One-time ticket from POST /auth/ws-ticket: the JWT never appears in the URL.
    user_id = token_store.consume_ws_ticket(ticket) if ticket else None
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = crud_user.get_user(db, user_id)
        session = crud_attendance.get_session(db, session_id)
        if user is None or session is None or user.status != UserStatusEnum.ACTIVE:
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
    except (WebSocketDisconnect, ValueError, RuntimeError):
        # ValueError: non-JSON frame; RuntimeError: socket already closed.
        pass
    finally:
        connection_manager.disconnect(session_id, websocket)


@router.websocket("/ws/users/me")
async def user_websocket(websocket: WebSocket, ticket: str | None = None):
    user_id = token_store.consume_ws_ticket(ticket) if ticket else None
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = crud_user.get_user(db, user_id)
        if user is None or user.status != UserStatusEnum.ACTIVE:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    finally:
        db.close()

    await connection_manager.connect_user(user_id, websocket)
    try:
        await websocket.send_json({"event": "connected", "payload": {"user_id": user_id}})
        while True:
            message = await websocket.receive_json()
            if message.get("event") == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
    except (WebSocketDisconnect, ValueError, RuntimeError):
        pass
    finally:
        connection_manager.disconnect_user(user_id, websocket)
