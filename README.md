# mfgpro_mockup

[![uv](https://img.shields.io/badge/uv-261230?logo=uv)](https://github.com/astral-sh/uv) [![Ruff](https://img.shields.io/badge/Ruff-261230?logo=ruff)](https://github.com/astral-sh/ruff) [![pytest](https://img.shields.io/badge/pytest-white?logo=pytest&style=&labelColor=white)](https://docs.pytest.org/en/stable/) [![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit&logoColor=white)](https://github.com/pre-commit/pre-commit)

---

## Development guide

### Prerequisites

Ensure the following tools are installed:

- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)

### Step 1: Clone the repository

Clone the repository and navigate into the project directory:

```bash
git clone https://dev.azure.com/PepsiCoIT/Global_SnT_DS_MCT/_git/mfgpro_mockup
cd mfgpro_mockup
```

### Step 2: Set up environment variables

Set up the `UV_INDEX_JFROG_USERNAME` and `UV_INDEX_JFROG_PASSWORD` environment variables as outlined in [this guide](https://datascience.mypepsico.com/ds-standards-cookiecutter/end-to-end-guide/5-jfrog/#setting-up-environment-variables) to securely download Python packages via JFrog and access all reusable assets.

### Step 3: Install pre-commit hooks

Set up pre-commit hooks to automatically check code quality:

```bash
uv run pre-commit install
```

### Step 4: Install Frontend Packages

```bash
npm --prefix mfgpro_mockup/frontend install
npm --prefix mfgpro_mockup/frontend audit fix
```

### Step 5: Run the Backend

To execute the Backend code, run in a cmd console:

```bash
uvicorn mfgpro_mockup.backend.app.main:app --host 0.0.0.0 --port 9898
```

### Step 6: Run the Frontend

Open another cmd console (mantain open the Backend Console), and run:

```bash
npm --prefix mfgpro_mockup/frontend run dev
```
