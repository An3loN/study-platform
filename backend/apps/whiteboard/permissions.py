import hmac

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsHocuspocus(BasePermission):
    """Разрешает доступ только Hocuspocus-серверу через общий секрет."""

    def has_permission(self, request, view):
        secret = request.headers.get('X-Hocuspocus-Secret', '')
        # compare_digest, а не ==: время сравнения не должно подсказывать,
        # сколько первых символов угадано
        return bool(secret) and hmac.compare_digest(
            secret.encode(), settings.HOCUSPOCUS_SECRET.encode(),
        )
