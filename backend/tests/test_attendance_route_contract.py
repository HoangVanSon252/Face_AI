from app.main import app


def test_attendance_workflow_routes_are_registered():
    paths = app.openapi()["paths"]
    assert "/api/v1/sections/{section_id}/sessions" in paths
    assert "/api/v1/sessions/{session_id}/open" in paths
    assert "/api/v1/sessions/{session_id}/attendance" in paths
    assert "/api/v1/attendance/{record_id}" in paths
    assert "/api/v1/attendance/{record_id}/appeals" in paths
    assert "/api/v1/appeals/{appeal_id}/resolve" in paths
    assert "/api/v1/reports/sessions/{session_id}" in paths
    assert "/api/v1/audit-logs" in paths
