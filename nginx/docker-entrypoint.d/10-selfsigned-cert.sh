#!/bin/sh
# Заглушка сертификата, чтобы nginx поднялся до первого выпуска.
#
# Курица и яйцо: certbot получает сертификат через проверку по http, а её
# обслуживает nginx — но nginx не стартует, если файла сертификата нет.
# Поэтому на пустом месте кладём самоподписанный: он никого не устроит как
# сертификат, но 80-й порт заработает, и certbot сможет выпустить настоящий,
# который ляжет на то же место.
set -e

CERT_DIR="/etc/letsencrypt/live/${APP_DOMAIN}"

if [ -f "${CERT_DIR}/fullchain.pem" ]; then
    exit 0
fi

echo "[tls] Сертификата для ${APP_DOMAIN} нет — ставлю самоподписанную заглушку."
mkdir -p "${CERT_DIR}"
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=${APP_DOMAIN}" 2>/dev/null
echo "[tls] Заглушка готова. Выпустите настоящий сертификат — см. deploy/README.md."
