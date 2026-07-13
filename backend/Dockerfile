FROM ghcr.io/astral-sh/uv:debian-slim

WORKDIR /app

COPY pyproject.toml uv.lock /app/

ENV UV_PYTHON_INSTALL_DIR=/app/.uv-python

RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
    && uv sync --locked --no-dev --no-install-project

COPY --chown=app:app . /app/

EXPOSE 8000

ENV UV_NO_CACHE=1

RUN chown -R app:app /app \
    && ln -s /app/.venv/bin/python3 /usr/local/bin/python

USER app

CMD ["uv", "run", "--no-sync", "fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
