# Выкладка в прод

Образы собирает GitLab CI на своём раннере и кладёт в реестр проекта, сервер
их только забирает. Собирать на прод-сервере нельзя: сборке фронтенда не хватит
двух гигабайт памяти, и она утащит за собой работающие контейнеры.

## Что происходит при пуше в main

1. Три параллельные джобы прогоняют тесты: `pytest`, `npm test` фронтенда и
   hocuspocus. У обоих фронтов следом `npm run build` — не ради артефакта, а
   ради `tsc`: сломанные типы не должны доезжать до сборки образа.
2. Собираются и выкладываются четыре образа — backend, frontend, hocuspocus,
   nginx. Каждый с двумя тегами: по коммиту и `latest`.
3. Джоба выкладки ждёт нажатия. Запущенная, она отправляет на сервер
   `docker-compose.yml` и `deploy.sh` и вызывает его: бэкап базы → `pull` →
   `up -d` → уборка старых образов.

Ветки и мерж-реквесты проходят только тесты.

## Что нужно один раз

### Свой раннер

Отдельная машина с docker — не прод-сервер. Всё, что нужно, лежит в
[`runner/`](../runner/README.md): compose-файл и конфиг. Тег раннера должен
быть `study-platform` — ровно он стоит у всех джоб.

### Прод-сервер

```bash
curl -fsSL https://get.docker.com | sh

sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/study-platform && sudo chown deploy:deploy /opt/study-platform
```

Ключ для CI (**без пароля** — вводить его будет некому):

```bash
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
sudo -u deploy sh -c 'cat /home/deploy/.ssh/id_ed25519.pub >> /home/deploy/.ssh/authorized_keys'
sudo -u deploy cat /home/deploy/.ssh/id_ed25519   # уйдёт в переменную SSH_PRIVATE_KEY
```

Доступ к реестру. Проект приватный, поэтому серверу нужен **deploy token** —
`Settings → Repository → Deploy tokens`, право `read_registry`. Он привязан к
проекту, а не к человеку, и отзывается одной кнопкой:

```bash
sudo -u deploy docker login registry.gitlab.com -u <имя токена> --password-stdin <<< "<значение>"
```

Порты наружу — только 80 и 443:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

### `.env` на сервере

Создаётся руками в `/opt/study-platform/.env` и в git не попадает никогда.
За основу — `.env.example`, но с настоящими значениями:

```bash
SECRET_KEY=$(openssl rand -base64 48)
HOCUSPOCUS_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
```

Обязательно заполнить `APP_DOMAIN`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
`CSRF_TRUSTED_ORIGINS` своим доменом и `REGISTRY_IMAGE` — адресом реестра
проекта.

### Первый запуск и сертификат

Курица и яйцо: certbot проверяет владение доменом по http, а отвечает на
проверку nginx — который без сертификата не стартует. Поэтому на пустом месте
nginx сам кладёт самоподписанную заглушку и поднимается, а настоящий
сертификат выпускается уже поверх.

```bash
cd /opt/study-platform

# 1. Пока сертификата нет, редирект Django отправил бы по кругу и саму
#    ACME-проверку
echo "SECURE_SSL_REDIRECT=False" >> .env

# 2. Поднять стек (nginx встанет с заглушкой)
IMAGE_TAG=latest ./deploy.sh

# 3. Выпустить настоящий сертификат на оба имени
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d example.com -d www.example.com \
  --email вы@почта --agree-tos --no-eff-email

# 4. Вернуть редирект и перезапустить
sed -i 's/^SECURE_SSL_REDIRECT=False/SECURE_SSL_REDIRECT=True/' .env
docker compose up -d
docker compose restart nginx
```

Дальше сертификат продлевается сам: контейнер `certbot` пробует раз в
двенадцать часов, nginx перечитывает конфигурацию раз в шесть.

### Первый преподаватель

Регистрации у преподавателя нет — учётку заводит владелец платформы:

```bash
docker compose exec backend python manage.py createsuperuser --phone +79990000000
```

### Переменные в GitLab

`Settings → CI/CD → Variables`. Все — **Protected** (доступны только защищённым
веткам, то есть main) и **Masked** там, где это секрет.

| Переменная | Тип | Что это |
|---|---|---|
| `SSH_PRIVATE_KEY` | File | приватный ключ пользователя `deploy` целиком |
| `SSH_KNOWN_HOSTS` | File | вывод `ssh-keyscan <хост>` |
| `SSH_HOST` | Variable | IP или домен сервера |
| `SSH_USER` | Variable | `deploy` |
| `SSH_PORT` | Variable | если ssh не на 22; иначе не заводить |
| `DEPLOY_PATH` | Variable | `/opt/study-platform` |
| `APP_DOMAIN` | Variable | домен, для ссылки на окружение в интерфейсе |

Учётных данных для реестра заводить не нужно: сборка ходит туда встроенным
job-токеном.

`SSH_KNOWN_HOSTS` заполняется один раз и не сканируется на каждом запуске —
так подмена ключа сервера не пройдёт незамеченной.

## Откат

Теги по коммиту для того и ставятся:

```bash
cd /opt/study-platform && IMAGE_TAG=<sha предыдущего коммита> ./deploy.sh
```

Откат кода миграции не отменяет. Если сломала именно миграция — восстанавливать
из бэкапа: `/opt/study-platform/backups/`, снимается перед каждой выкладкой,
хранятся последние 14.

## Чего здесь осознанно нет

**Celery не поднимается.** Задач у него пока ни одной, а воркер съел бы около
трёхсот мегабайт из двух гигабайт. Появятся задачи — `docker compose --profile
celery up -d`, и заодно добавить профиль в `deploy.sh`.

**Выкладка с простоем.** `docker compose up -d` пересоздаёт контейнеры, и
секунд десять сайт недоступен. Для одного преподавателя с учениками это
дешевле, чем возиться со сменой контейнеров без разрыва.

**Бэкапы лежат на том же сервере.** От неудачной миграции это спасает, от
потери сервера — нет. Если данные станут важны, копию надо увозить наружу.
