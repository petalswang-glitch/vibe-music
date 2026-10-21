import httpx

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app


async def test_reverse_proxy_prefix_keeps_legacy_login_errors_and_openapi_server():
    app = create_app(Settings())

    async def unused_session():
        yield None

    app.dependency_overrides[get_session] = unused_session
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, root_path="/api"), base_url="http://music.test"
    ) as client:
        for path in ("/api/user/login", "/api/admin/login"):
            response = await client.post(path, json={})
            assert response.status_code == 200
            assert response.json()["code"] == 1
        schema = (await client.get("/api/openapi.json")).json()
        assert schema["servers"] == [{"url": "/api"}]
