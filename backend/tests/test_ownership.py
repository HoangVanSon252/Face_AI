from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import require_section_access, require_student_access
from app.models.course import ClassSection
from app.models.user import RoleEnum


class FakeSession:
    def __init__(self, section=None):
        self.section = section

    def get(self, model, identifier):
        assert model is ClassSection
        assert identifier == 10
        return self.section


def test_admin_can_access_any_existing_section():
    section = SimpleNamespace(id=10, lecturer_id=2)
    admin = SimpleNamespace(id=1, role=RoleEnum.ADMIN)

    assert require_section_access(FakeSession(section), 10, admin) is section


def test_lecturer_cannot_access_another_lecturers_section():
    section = SimpleNamespace(id=10, lecturer_id=2)
    lecturer = SimpleNamespace(id=3, role=RoleEnum.LECTURER)

    with pytest.raises(HTTPException) as error:
        require_section_access(FakeSession(section), 10, lecturer)

    assert error.value.status_code == 403


def test_student_can_access_only_their_own_profile_without_db_query():
    student = SimpleNamespace(id=5, role=RoleEnum.STUDENT)

    require_student_access(FakeSession(), 5, student)

    with pytest.raises(HTTPException) as error:
        require_student_access(FakeSession(), 6, student)

    assert error.value.status_code == 403
