from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_liveness_does_not_require_external_services():
    with TestClient(create_app()) as client:
        assert client.get("/health/live").json() == {"status": "ok"}


def test_readiness_fails_when_dependencies_are_unavailable():
    settings = Settings(
        database_url="postgresql+asyncpg://unused:unused@127.0.0.1:1/unused",
        redis_url="redis://127.0.0.1:1/0",
    )
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["checks"] == {"postgres": False, "redis": False}


def test_invalid_pagination_uses_error_envelope():
    with TestClient(create_app()) as client:
        response = client.post("/song/getAllSongs", json={"pageNum": 0, "pageSize": 20})
        assert response.status_code == 422
        assert response.json() == {"code": 1, "message": "请求参数格式不正确", "data": None}


def test_unknown_route_uses_error_envelope():
    with TestClient(create_app()) as client:
        response = client.get("/does-not-exist")
        assert response.status_code == 404
        assert response.json()["code"] == 1
