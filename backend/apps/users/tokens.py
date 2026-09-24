"""
JWT, который перестаёт действовать, как только сменился пароль.

Refresh-токены при смене пароля гасятся блэклистом (User.revoke_sessions),
а access нигде не хранится, и отозвать его нечем: выданный до сброса он жил
бы ещё час. Поэтому в токен кладётся отпечаток хеша пароля — тот же приём,
которым Django разлогинивает сессии (get_session_auth_hash), — и при
каждой проверке он сравнивается с нынешним. Сменился пароль — сменился
отпечаток, и все токены, выданные раньше, отвечают 401.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

PASSWORD_CLAIM = 'pwd'


def password_stamp(user):
    # Хватает и части: подобрать совпадение не легче, чем сам ключ HMAC, а
    # токен ездит в каждом запросе
    return user.get_session_auth_hash()[:16]


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    # Access, выпущенный из этого refresh (и при обновлении тоже), наследует
    # отпечаток — ставить его отдельно не нужно
    refresh[PASSWORD_CLAIM] = password_stamp(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def password_is_current(token, user):
    return token.get(PASSWORD_CLAIM) == password_stamp(user)


class PasswordBoundJWTAuthentication(JWTAuthentication):
    """Обычная проверка JWT плюс отпечаток пароля."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not password_is_current(validated_token, user):
            raise AuthenticationFailed('Пароль сменился — войдите заново.', code='password_changed')
        return user
