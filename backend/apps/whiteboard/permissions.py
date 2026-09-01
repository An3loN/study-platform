from django.conf import settings
from rest_framework.permissions import BasePermission


class IsHocuspocus(BasePermission):
    """Разрешает доступ только Hocuspocus-серверу через общий секрет."""

    def has_permission(self, request, view):
        secret = request.headers.get('X-Hocuspocus-Secret', '')
        return bool(secret and secret == settings.HOCUSPOCUS_SECRET)
