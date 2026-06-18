import csv
import json
from pathlib import Path
from typing import Any


def _read_csv_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


class DataLoader:
    def __init__(self, data_dir: str = None):
        if data_dir is None:
            current_dir = Path(__file__).parent.parent.parent
            data_dir = current_dir / "data"
        self.data_dir = Path(data_dir)
        self._assets = None
        self._root_causes = None
        self._anomalies_rows = None
        self._recommendations_rows = None
        self._maintenance_rows = None

    def load_assets(self) -> dict[str, Any]:
        if self._assets is None:
            assets_path = self.data_dir / "assets.json"
            if assets_path.exists():
                with open(assets_path, encoding="utf-8") as f:
                    self._assets = json.load(f)
            else:
                self._assets = {}
        return self._assets

    def load_root_causes(self) -> dict[str, Any]:
        if self._root_causes is None:
            root_causes_path = self.data_dir / "root_causes.json"
            if root_causes_path.exists():
                with open(root_causes_path, encoding="utf-8") as f:
                    self._root_causes = json.load(f)
            else:
                self._root_causes = {}
        return self._root_causes

    def load_anomalies(self) -> list[dict[str, Any]]:
        if self._anomalies_rows is None:
            self._anomalies_rows = _read_csv_rows(self.data_dir / "anomalies.csv")
        return self._anomalies_rows

    def load_recommendations(self) -> list[dict[str, Any]]:
        if self._recommendations_rows is None:
            self._recommendations_rows = _read_csv_rows(self.data_dir / "recommendations.csv")
        return self._recommendations_rows

    def load_maintenance(self) -> list[dict[str, Any]]:
        if self._maintenance_rows is None:
            self._maintenance_rows = _read_csv_rows(self.data_dir / "maintenance.csv")
        return self._maintenance_rows

    def get_assets_filtered(
        self,
        state: str | None = None,
        plant: str | None = None,
        asset_id: str | None = None,
    ) -> list[dict[str, Any]]:
        assets = self.load_assets()
        asset_list = assets.get("assets", [])
        filtered = asset_list
        if state:
            filtered = [a for a in filtered if a.get("state") == state]
        if plant:
            filtered = [a for a in filtered if a.get("plant") == plant]
        if asset_id:
            filtered = [a for a in filtered if a.get("asset_id") == asset_id]
        return filtered

    def get_asset_summary(self) -> dict[str, int]:
        assets = self.load_assets()
        asset_list = assets.get("assets", [])
        summary = {
            "total": len(asset_list),
            "working": 0,
            "failure_predicted": 0,
            "under_maintenance": 0,
            "breakdown": 0,
        }
        for asset in asset_list:
            status = asset.get("status", "working").lower()
            if status == "working":
                summary["working"] += 1
            elif status == "failure predicted":
                summary["failure_predicted"] += 1
            elif status == "under maintenance":
                summary["under_maintenance"] += 1
            elif status == "breakdown":
                summary["breakdown"] += 1
        return summary
