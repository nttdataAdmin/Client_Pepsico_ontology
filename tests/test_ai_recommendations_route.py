from fastapi.testclient import TestClient

from mfgpro_mockup.backend.app.main import app

client = TestClient(app)


def test_recommendations_executive_payload():
    body = {
        "asset_id": "TEST-1",
        "asset_type": "Palletizer",
        "status": "Working",
        "criticality": "Medium",
        "plant": "Plano A",
        "state": "TX",
        "kpiDigestForAi": "Line OEE 75% Watch",
        "timestamp": "2026-04-29T12:00:00Z",
        "cmmsWorkcenterRoles": "Packaging Mech — Line 2",
    }
    r = client.post("/api/ai/recommendations", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "result" in data
    assert isinstance(data["result"], str)
    assert len(data["result"]) > 20
    assert "nba" in data
    assert data["nba"] is not None
    assert "action_id" in data["nba"]
    assert "title" in data["nba"]
    assert data["nba"].get("title")
