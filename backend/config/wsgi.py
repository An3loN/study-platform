import os
from django.core.wsgi import get_wsgi_application

# По умолчанию prod: незаданная переменная должна ронять запуск, а не молча
# поднимать сервер с DEBUG=True. Dev-настройки задаются явно в compose и Dockerfile.dev.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.prod')

application = get_wsgi_application()
