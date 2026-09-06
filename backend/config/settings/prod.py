from .base import *

DEBUG = False

ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=lambda v: [s.strip() for s in v.split(',')])

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    cast=lambda v: [s.strip() for s in v.split(',')],
)

# Django 4+ сверяет заголовок Origin при небезопасных запросах. Без этого
# админка за прокси отвергает вход по CSRF — а понять это по сообщению трудно.
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()],
)

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# На https переводит сам nginx, здесь это второй рубеж. Но переменной он
# управляется не зря: пока сертификата нет, редирект Django отправляет по
# кругу и ACME-проверку тоже — первый запуск делается с False, а после
# выпуска сертификата флаг возвращается.
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SESSION_COOKIE_SECURE = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
CSRF_COOKIE_SECURE = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
