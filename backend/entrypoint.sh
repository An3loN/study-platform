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

exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
