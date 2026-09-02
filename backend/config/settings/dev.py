from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

CORS_ALLOW_ALL_ORIGINS = True

# В dev не требуем секрет через .env — база требует его только в prod
HOCUSPOCUS_SECRET = config('HOCUSPOCUS_SECRET', default='dev-secret-change-in-production')

INSTALLED_APPS += ['debug_toolbar']

MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']

# Запросы приходят из docker-сети через nginx, поэтому проверка по INTERNAL_IPS
# не срабатывала никогда и панель не показывалась. В dev-контуре показываем всегда.
DEBUG_TOOLBAR_CONFIG = {'SHOW_TOOLBAR_CALLBACK': lambda request: True}

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
