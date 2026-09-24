import bcrypt
from sqlalchemy.orm import Session
from app.models.user import User, Student, Lecturer, RoleEnum
from app.schemas.user import UserCreate
from app.core.exceptions import APIException
from app.core.security import get_password_hash

class UserService:
    @staticmethod
    def create_user(db: Session, user_in: UserCreate):
        if db.query(User).filter(User.username == user_in.username).first():
            raise APIException(status_code=409, code="USERNAME_ALREADY_EXISTS", message="Tên đăng nhập đã tồn tại")
        
        if db.query(User).filter(User.email == user_in.email).first():
            raise APIException(status_code=409, code="EMAIL_ALREADY_EXISTS", message="Email đã được sử dụng")
        # 2. Tạo User chính
        new_user = User(
            username=user_in.username,
            email=user_in.email,
            password_hash=get_password_hash(user_in.password),
            full_name=user_in.full_name,
            role=user_in.role
        )
        db.add(new_user)
        db.flush() 
        
        # 3. Tạo Hồ sơ tương ứng theo Role
        if user_in.role == RoleEnum.STUDENT:
            if not user_in.student:
                raise APIException(status_code=422, code="REQUEST_VALIDATION_ERROR", message="Phải gửi kèm thông tin student")
            
            if db.query(Student).filter(Student.student_code == user_in.student.student_code).first():
                raise APIException(status_code=409, code="STUDENT_CODE_ALREADY_EXISTS", message="Mã sinh viên đã tồn tại")
                
            new_student = Student(user_id=new_user.id, **user_in.student.model_dump())
            db.add(new_student)
            
        elif user_in.role == RoleEnum.LECTURER:
            if not user_in.lecturer:
                raise APIException(status_code=422, code="REQUEST_VALIDATION_ERROR", message="Phải gửi kèm thông tin lecturer")
                
            new_lecturer = Lecturer(user_id=new_user.id, **user_in.lecturer.model_dump())
            db.add(new_lecturer)
            
        db.commit()
        db.refresh(new_user)
        return new_user

    @staticmethod
    def get_user_by_id(db: Session, user_id: int):
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise APIException(status_code=404, code="RESOURCE_NOT_FOUND", message="Không tìm thấy tài khoản")
        return user
