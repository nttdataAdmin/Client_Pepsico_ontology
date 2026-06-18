from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — same folder as this package's parent (app -> backend).
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_PATH = _BACKEND_DIR / ".env"
# Also try repo-root .env (some IDEs / hosts run with cwd = pepsico/)
_ROOT_ENV = _BACKEND_DIR.parent / ".env"

# Load into os.environ so values win over empty GRAPH_* placeholders in the shell/IDE.
if _ENV_PATH.is_file():
    load_dotenv(_ENV_PATH, encoding="utf-8-sig", override=True)
elif _ROOT_ENV.is_file():
    load_dotenv(_ROOT_ENV, encoding="utf-8-sig", override=True)


_settings_file_kw: dict = {
    "env_file_encoding": "utf-8-sig",
    "env_ignore_empty": True,
    "extra": "ignore",
}
if _ENV_PATH.is_file():
    _settings_file_kw["env_file"] = str(_ENV_PATH)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(**_settings_file_kw)

    azure_endpoint: str = ""
    azure_deployment: str = "gpt-4.1"
    azure_api_key: str = ""
    azure_api_version: str = "2024-08-01-preview"
    # Global page assistant (longer answers; override via env AZURE_ASSISTANT_MAX_TOKENS)
    azure_assistant_max_tokens: int = 4096
    # gpt-4o and newer Azure deployments reject max_tokens;
    # use max_completion_tokens (set false for legacy models)
    azure_use_max_completion_tokens: bool = True

    azure_doc_intelligence_endpoint: str = ""
    azure_doc_intelligence_key: str = ""
    azure_doc_intelligence_use_ocr: bool = False
    form_classify_default: str = "go"

    # CatBoost next-best-action (relative to backend/ if not absolute)
    catboost_nba_model_dir: str = ""

    # Microsoft Graph — maintenance work-order email (see backend/.env.example)
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_mailbox_upn: str = ""
    graph_notify_default_to: str = ""

    # Optional SMTP fallback when Graph is not configured (e.g. smtp.office365.com:587)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True


settings = Settings()
