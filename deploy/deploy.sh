#!/bin/sh
# Выкладка на сервере. Запускается из CI по ssh, но руками работает так же:
#
#   cd /opt/study-platform && IMAGE_TAG=<sha> ./deploy.sh
#
# Без IMAGE_TAG берётся latest — годится, чтобы поднять стенд с нуля, но для
# отката указывайте конкретный коммит: latest всегда указывает на последний.
set -eu

IMAGE_TAG="${IMAGE_TAG:-latest}"
export IMAGE_TAG

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"

echo "── Выкладка ${IMAGE_TAG}"

# ── Бэкап базы ───────────────────────────────────────────────────────────────
# Перед миграциями и только если база уже поднята: на первом запуске её ещё
# нет, и это не повод останавливать выкладку. Неудачная миграция без бэкапа
# необратима — это единственное, что здесь по-настоящему страшно.
if docker compose ps --status running --services 2>/dev/null | grep -q '^postgres$'; then
    mkdir -p "$BACKUP_DIR"
    STAMP=$(date +%Y%m%d-%H%M%S)
    echo "── Бэкап базы в ${BACKUP_DIR}/db-${STAMP}.sql.gz"
    docker compose exec -T postgres \
        sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
        | gzip > "${BACKUP_DIR}/db-${STAMP}.sql.gz"

    # Диска сорок гигабайт — старые копии надо чистить, иначе кончится
    ls -1t "${BACKUP_DIR}"/db-*.sql.gz 2>/dev/null \
        | tail -n +$((KEEP_BACKUPS + 1)) \
        | xargs -r rm --
else
    echo "── Базы нет, бэкап пропускаю (первый запуск?)"
fi

# ── Образы ───────────────────────────────────────────────────────────────────
echo "── Забираю образы"
docker compose pull --quiet

echo "── Перезапускаю"
docker compose up -d --remove-orphans

# ── Уборка ───────────────────────────────────────────────────────────────────
# Без этого предыдущие образы копятся и съедают диск за пару месяцев
echo "── Убираю старые образы"
docker image prune -f >/dev/null

echo "── Готово. Состояние:"
docker compose ps
