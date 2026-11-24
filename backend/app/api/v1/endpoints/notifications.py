from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import dependencies
from app.models.notification import Notification
from app.models.user import User
from app.services.notifications import serialize

router = APIRouter()


@router.get("/notifications")
def list_notifications(
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(dependencies.get_db),
    current_user: User = Depends(dependencies.get_current_active_user),
):
    """The caller's own notifications only; audit logs stay on the admin page."""
    mine = db.query(Notification).filter(Notification.user_id == current_user.id)
    items = mine.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread = mine.filter(Notification.is_read.is_(False)).count()
    return {"items": [serialize(item) for item in items], "unread_count": unread}


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user: User = Depends(dependencies.get_current_active_user),
):
    item = db.get(Notification, notification_id)
    if item is None or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.is_read = True
    db.commit()


@router.post("/notifications/read-all", status_code=204)
def mark_all_read(
    db: Session = Depends(dependencies.get_db),
    current_user: User = Depends(dependencies.get_current_active_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read.is_(False)
    ).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
