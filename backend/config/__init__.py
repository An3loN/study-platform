# Celery-приложение должно импортироваться при старте Django: без этого
# `celery -A config worker` не находит app, а shared_task не привязывается.
from .celery import app as celery_app

__all__ = ('celery_app',)
