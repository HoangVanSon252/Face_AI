from fastapi import APIRouter

router = APIRouter()

@router.get("/me")
def read_user_me():
    return {"username": "fakecurrentuser"}
