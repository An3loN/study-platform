import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.prod')

# namespace='CELERY' — читаем настройки с префиксом CELERY_ из Django settings
app = Celery('study_platform')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
