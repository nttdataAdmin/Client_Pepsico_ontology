from mfgpro_mockup.backend.app.services.nba_features import (
    build_nba_feature_row,
    row_to_ordered_list,
)


def test_build_nba_feature_row_shape():
    row = build_nba_feature_row(
        {
            "asset_id": "A-1",
            "status": "Working",
            "criticality": "High",
            "asset_type": "Fryer",
            "plant": "Dallas",
            "state": "TX",
            "rul": "500 hours",
            "kpiDigestForAi": "OEE 82% Good\nScrap 4% Bad",
            "qcSignals": {"no_go": False},
        }
    )
    assert row["status"] == "Working"
    assert row["qc_nogo"] == 0.0
    assert row["n_kpi_bad"] >= 1.0
    assert row["rul_numeric"] == 500.0
    order = list(row.keys())
    vec = row_to_ordered_list(row, order)
    assert len(vec) == len(order)


def test_row_order_stable():
    d = {
        "status": "Breakdown",
        "criticality": "High",
        "asset_type": "X",
        "plant": "P",
        "state": "S",
    }
    r1 = build_nba_feature_row(d)
    r2 = build_nba_feature_row(d)
    assert r1 == r2
