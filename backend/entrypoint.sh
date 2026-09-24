#!/bin/sh
set -e

echo "Waiting for postgres..."
until python -c "import psycopg2; psycopg2.connect(
    dbname='$POSTGRES_DB',
    user='$POSTGRES_USER',
    password='$POSTGRES_PASSWORD',
    host='$POSTGRES_HOST',
    port='$POSTGRES_PORT'
)" 2>/dev/null; do
    sleep 1
done
echo "Postgres is ready."

python manage.py migrate --settings=config.settings.prod
python manage.py collectstatic --noinput --settings=config.settings.prod

# WSGI под gunicorn, а не ASGI под daphne: WebSocket у Django больше нет
# (доска — в Hocuspocus), а daphne держал один процесс и гонял синхронные
# вьюхи через пул потоков. Два процесса по четыре потока — на сервере с
# двумя гигабайтами это около двухсот мегабайт. Лог запросов пишет nginx,
# здесь только ошибки. Переопределяется GUNICORN_CMD_ARGS.
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --worker-class gthread \
    --timeout 60 \
    --max-requests 2000 --max-requests-jitter 200
