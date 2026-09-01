from urllib.parse import parse_qs

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

User = get_user_model()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Достаёт пользователя из ?token=. Кроме обычного JWT принимает гостевой
    токен урока — тогда пользователя нет, но в scope кладётся гость.
    """

    async def __call__(self, scope, receive, send):
        user, guest = await self._authenticate(scope)
        scope['user'] = user
        scope['guest'] = guest
        return await super().__call__(scope, receive, send)

    def _extract_token(self, scope):
        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        values = params.get('token')
        return values[0] if values else None

    @database_sync_to_async
    def _authenticate(self, scope):
        token_key = self._extract_token(scope)
        if not token_key:
            return AnonymousUser(), None

        try:
            token = AccessToken(token_key)
        except (InvalidToken, TokenError):
            return AnonymousUser(), None

        if token.get('guest'):
            return AnonymousUser(), {
                'id': f'guest:{token["jti"]}',
                'name': token.get('name') or 'Гость',
                'room_id': str(token.get('room_id') or ''),
            }

        try:
            return User.objects.get(id=token['user_id']), None
        except (KeyError, User.DoesNotExist):
            return AnonymousUser(), None
