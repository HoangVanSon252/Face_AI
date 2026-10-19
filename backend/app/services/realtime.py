import asyncio
import json
import logging

from redis.asyncio import Redis

from app.core.config import settings
from app.services.connection_manager import connection_manager

logger = logging.getLogger("face_attendance")
CHANNEL = "face_attendance:realtime"


class RealtimeService:
    def __init__(self):
        self._redis: Redis | None = None
        self._listener_task: asyncio.Task | None = None

    async def start(self) -> None:
        try:
            self._redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            self._listener_task = asyncio.create_task(self._listen())
        except Exception:
            logger.warning("realtime_redis_unavailable")
            if self._redis is not None:
                await self._redis.aclose()
            self._redis = None

    async def stop(self) -> None:
        if self._listener_task is not None:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    async def publish(self, session_id: int, event: str, payload: dict) -> None:
        message = {"session_id": session_id, "event": event, "payload": payload}
        if self._redis is None:
            await connection_manager.broadcast(session_id, event, payload)
            return
        await self._redis.publish(CHANNEL, json.dumps(message))

    async def send_user_event(self, user_id: int, event: str, payload: dict) -> None:
        message = {"user_id": user_id, "event": event, "payload": payload}
        if self._redis is None:
            await connection_manager.send_to_user(user_id, event, payload)
            return
        await self._redis.publish(CHANNEL, json.dumps(message))

    async def kick_user(self, user_id: int, reason: str = "Tài khoản của bạn đã bị vô hiệu hóa.") -> None:
        message = {"user_id": user_id, "event": "FORCE_LOGOUT", "payload": {"reason": reason}, "is_kick": True}
        if self._redis is None:
            await connection_manager.kick_user(user_id, reason)
            return
        await self._redis.publish(CHANNEL, json.dumps(message))

    async def _listen(self) -> None:
        if self._redis is None:
            return
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(CHANNEL)
        try:
            async for raw_message in pubsub.listen():
                if raw_message.get("type") != "message":
                    continue
                message = json.loads(raw_message["data"])
                if message.get("is_kick") and "user_id" in message:
                    await connection_manager.kick_user(int(message["user_id"]), message.get("payload", {}).get("reason", ""))
                elif "user_id" in message:
                    await connection_manager.send_to_user(int(message["user_id"]), message["event"], message["payload"])
                elif "session_id" in message:
                    await connection_manager.broadcast(
                        int(message["session_id"]),
                        message["event"],
                        message["payload"],
                    )
        finally:
            await pubsub.unsubscribe(CHANNEL)
            await pubsub.aclose()


realtime_service = RealtimeService()
