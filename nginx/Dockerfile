FROM nginx:1.27-alpine

# openssl — для самоподписанной заглушки на первом старте (см. entrypoint)
RUN apk add --no-cache openssl

# Только APP_*: без фильтра envsubst съел бы $http_host, $uri и прочие
# переменные самого nginx
ENV NGINX_ENVSUBST_FILTER="APP_"

COPY ssl-params.conf /etc/nginx/ssl-params.conf
COPY templates/ /etc/nginx/templates/
COPY docker-entrypoint.d/ /docker-entrypoint.d/
