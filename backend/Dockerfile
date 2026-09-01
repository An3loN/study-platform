FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.5 \
    POETRY_NO_INTERACTION=1 \
    # Не создаём venv — в контейнере это излишне
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}"

# Копируем файлы зависимостей отдельным слоем — Docker кешируeт их
# пока pyproject.toml / poetry.lock не изменятся
COPY pyproject.toml poetry.lock* ./
RUN poetry install --only=main --no-root --no-cache

COPY . .

RUN python manage.py collectstatic --noinput --settings=config.settings.prod

EXPOSE 8000
ENTRYPOINT ["sh", "entrypoint.sh"]
