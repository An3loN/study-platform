"""
Настройки под тесты: те же, что в разработке, но без debug-toolbar (его
middleware лезет в каждый ответ) и с быстрым хешированием паролей — иначе
на создание каждого пользователя уходит больше времени, чем на сам тест.
"""
from .base import *  # noqa: F401,F403

DEBUG = False

ALLOWED_HOSTS = ['*']

HOCUSPOCUS_SECRET = 'test-secret'

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
