from app.main import app


def test_face_biometric_routes_are_registered():
    """Keep the public E2E endpoints from being removed during refactors."""
    paths = app.openapi()["paths"]

    assert "/api/v1/students/{student_id}/face-profiles" in paths
    assert "/api/v1/students/{student_id}/face-profile" in paths
    assert "/api/v1/sessions/{session_id}/recognitions" in paths
    assert "/api/v1/attendance/{record_id}/evidence-url" in paths


def test_evidence_url_is_not_a_public_resource():
    """The evidence endpoint must stay protected by an authenticated route."""
    operation = app.openapi()["paths"]["/api/v1/attendance/{record_id}/evidence-url"]["get"]

    assert operation["responses"].get("200")
    assert operation.get("security")
