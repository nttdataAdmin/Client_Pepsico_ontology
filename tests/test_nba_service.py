from mfgpro_mockup.backend.app.services.nba_service import NBAService


def test_nba_predict_breakdown():
    svc = NBAService()
    out = svc.predict(
        {
            "asset_id": "Z",
            "status": "Breakdown",
            "criticality": "High",
            "asset_type": "Fryer",
            "plant": "P",
            "state": "TX",
        }
    )
    assert "action_id" in out
    assert "title" in out
    assert isinstance(out.get("top_probabilities"), list)


def test_rule_fallback_when_no_catboost(monkeypatch, tmp_path):
    svc = NBAService()
    monkeypatch.setattr("app.services.nba_service._nba_dir", lambda: tmp_path)
    svc._attempted_load = False
    svc._model = None
    svc._catalog = {}
    svc._feature_order = []
    svc._cat_indices = []
    svc._load_error = None
    out = svc.predict(
        {"status": "Unknown", "criticality": "Low", "asset_type": "C", "plant": "x", "state": "y"}
    )
    assert out["action_id"] in (0, 1, 2, 3, 4)
    assert out.get("model_ok") is False
