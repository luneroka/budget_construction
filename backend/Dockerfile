# Development stage: full dependencies (including dev tools), hot-reloading
# dev server. Runs as root so the bind-mounted /app stays writable, and lets
# uv install its managed Python under /root (outside /app) so the compose
# bind mount does not shadow the interpreter. Used by docker-compose.yml.
FROM ghcr.io/astral-sh/uv:debian-slim AS development

WORKDIR /app

COPY pyproject.toml uv.lock /app/

RUN uv sync --locked --no-install-project

COPY . /app/

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]


# Production stage: runtime dependencies only, non-root user, production
# server. This is the last stage, so builds without an explicit target
# (docker-compose.prod.yml) resolve to it. Used by docker-compose.prod.yml.
FROM ghcr.io/astral-sh/uv:debian-slim AS production

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
