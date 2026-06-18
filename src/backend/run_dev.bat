@echo off
REM Listen on all interfaces so http://<this-machine-ip>:9898 (e.g. /docs) works from other hosts.
cd /d "%~dp0"
call "%~dp0venv\Scripts\activate.bat"
python -m uvicorn app.main:app --host 0.0.0.0 --port 9898 --reload
