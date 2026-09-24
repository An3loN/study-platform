from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    # Local
    'apps.common',
    'apps.users',
    'apps.lessons',
    'apps.whiteboard',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB'),
        'USER': config('POSTGRES_USER'),
        'PASSWORD': config('POSTGRES_PASSWORD'),
        'HOST': config('POSTGRES_HOST', default='postgres'),
        'PORT': config('POSTGRES_PORT', default='5432'),
        # Соединение живёт между запросами, а не открывается на каждый заново
        # (это несколько миллисекунд и процесс Postgres на каждый запрос).
        # Перед использованием проверяется: Postgres мог его закрыть.
        'CONN_MAX_AGE': config('CONN_MAX_AGE', default=60, cast=int),
        'CONN_HEALTH_CHECKS': True,
    }
}

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Загруженные файлы раздаются только по подписанной ссылке через Django —
# см. apps/common/media.py. Статика остаётся обычной.
STORAGES = {
    'default': {'BACKEND': 'apps.common.media.ProtectedMediaStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
# Внутренний location nginx, куда Django переадресует отдачу файла. Пусто —
# файл отдаёт сам Django: так в разработке и в тестах, где nginx нет или
# он просто проксирует.
MEDIA_ACCEL_REDIRECT_PREFIX = None

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        # JWT, привязанный к паролю: смена пароля гасит и access-токены
        'apps.users.tokens.PasswordBoundJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.common.pagination.Pagination',
    'PAGE_SIZE': 20,
    # Частота запросов к тому, что открыто без входа и где есть что подбирать:
    # пароль на /auth/login/, регистрация и гостевой вход по ссылке. Считается
    # по IP (ScopedRateThrottle во вьюхах).
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',
        # Гостей бывает целый класс за одним NAT школы — лимит щедрее
        'join': '60/min',
    },
    # Перед Django стоит ровно один nginx. Без этого DRF брал бы весь
    # X-Forwarded-For целиком, а его начало клиент пишет сам — подставляя
    # каждый раз новое значение, он обходил бы лимит.
    'NUM_PROXIES': 1,
}

# Кеш нужен лимитам частоты запросов. Redis, а не память процесса: счётчики
# должны быть общими для всех воркеров и переживать перезапуск.
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': config('CACHE_URL', default='redis://redis:6379/3'),
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    # Ротация без блэклиста оставляла старый refresh валидным до конца срока
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://redis:6379/1')

# Shared secret between Django and Hocuspocus (internal service communication)
HOCUSPOCUS_SECRET = config('HOCUSPOCUS_SECRET')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://redis:6379/1')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'

# Ошибки — в stdout контейнера, откуда их читает `docker compose logs`.
# По умолчанию Django при DEBUG=False шлёт трейсбеки 500-х только письмом
# на ADMINS, которых нет, — то есть в никуда: упавший запрос не оставлял
# следа нигде, кроме строки 500 в логе nginx.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'plain': {'format': '{asctime} {levelname} {name}: {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'},
    },
    'root': {'handlers': ['console'], 'level': 'WARNING'},
    'loggers': {
        # Только 500-е с трейсбеком: 4xx — обычные ответы (протухший токен,
        # неверная форма), их и так видно в логе nginx
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'django.security': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'apps': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
