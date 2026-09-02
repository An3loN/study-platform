FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.5 \
    POETRY_NO_INTERACTION=1 \
    # Не создаём venv — в контейнере это излишне
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app

# Компилятор и libpq-dev не нужны: psycopg2-binary и Pillow ставятся
# готовыми wheel-ами.

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}"

# Копируем файлы зависимостей отдельным слоем — Docker кешируeт их
# пока pyproject.toml / poetry.lock не изменятся
COPY pyproject.toml poetry.lock* ./
RUN poetry install --only=main --no-root --no-cache

COPY . .

# collectstatic здесь запускать нельзя: prod-настройки требуют SECRET_KEY и
# прочие переменные, а .env в build-контекст не попадает (см. .dockerignore).
# Статика собирается в entrypoint.sh, когда переменные уже есть.

EXPOSE 8000
ENTRYPOINT ["sh", "entrypoint.sh"]
