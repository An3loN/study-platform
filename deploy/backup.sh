#!/bin/sh
# Резервные копии: база и загруженные файлы (работы учеников, вложения).
#
#   ./backup.sh        — база и файлы; это запускает cron раз в сутки
#   ./backup.sh db     — только база; это зовёт deploy.sh перед миграциями
#
# Копии складываются в BACKUP_DIR на этом же сервере — от неудачной миграции
# или случайного удаления это спасает, а от потери самого сервера нет.
# Поэтому, если задан BACKUP_REMOTE (user@host:/путь), папка с копиями после
# каждого запуска зеркалируется туда через rsync по ssh. Настройка — в
# deploy/README.md, раздел «Бэкапы».
set -eu

cd "$(dirname "$0")"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
# База маленькая, копий держим две недели
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
# Файлы весят несравнимо больше, а диска сорок гигабайт — копий три
KEEP_MEDIA_BACKUPS="${KEEP_MEDIA_BACKUPS:-3}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
WHAT="${1:-all}"

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

running() {
    docker compose ps --status running --services 2>/dev/null | grep -q "^$1\$"
}

# Оставить `keep` самых свежих файлов по шаблону, остальное удалить
rotate() {
    ls -1t "$BACKUP_DIR"/$1 2>/dev/null | tail -n +$(($2 + 1)) | xargs -r rm --
}

# dump <имя файла> <команда...> — сжать вывод команды в копию.
#
# Пишем во временный файл и переименовываем, только если команда отработала:
# оборванный дамп не должен выглядеть годной копией и вытеснить при ротации
# настоящую. Статус проверяется отдельно, потому что в sh нет pipefail — у
# конвейера `pg_dump | gzip` он был бы статусом gzip, то есть всегда успехом.
dump() {
    target="$BACKUP_DIR/$1"
    shift
    failed="$target.failed"
    rm -f "$failed"
    { "$@" || touch "$failed"; } | gzip -1 > "$target.partial"
    if [ -e "$failed" ]; then
        rm -f "$failed" "$target.partial"
        echo "── Не удалось снять $target" >&2
        exit 1
    fi
    mv "$target.partial" "$target"
    echo "── $(du -h "$target" | cut -f1) → $target"
}

# ── База ─────────────────────────────────────────────────────────────────────
if running postgres; then
    dump "db-${STAMP}.sql.gz" docker compose exec -T postgres \
        sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
    rotate 'db-*.sql.gz' "$KEEP_BACKUPS"
elif [ "$WHAT" = db ]; then
    # Первый запуск выкладки: базы ещё нет, и это не повод её останавливать
    echo "── Базы нет, бэкап пропускаю (первый запуск?)"
    exit 0
else
    # А вот ночной бэкап без базы — это авария, о ней надо узнать
    echo "── postgres не запущен — бэкап не снят" >&2
    exit 1
fi

# ── Файлы ────────────────────────────────────────────────────────────────────
if [ "$WHAT" = all ]; then
    if running backend; then
        # Том media_files смонтирован в backend; tar там есть
        dump "media-${STAMP}.tar.gz" docker compose exec -T backend tar -C /app/media -cf - .
        rotate 'media-*.tar.gz' "$KEEP_MEDIA_BACKUPS"
    else
        echo "── backend не запущен — файлы не скопированы" >&2
        exit 1
    fi
fi

# ── С сервера ────────────────────────────────────────────────────────────────
if [ -n "$BACKUP_REMOTE" ]; then
    # --delete: удалённая папка повторяет локальную вместе с ротацией, иначе
    # копии там копились бы без конца. .partial не уносим — это недописанное
    rsync -a --delete --exclude '*.partial' --exclude '*.failed' "$BACKUP_DIR/" "$BACKUP_REMOTE/"
    echo "── Скопировано в $BACKUP_REMOTE"
fi
