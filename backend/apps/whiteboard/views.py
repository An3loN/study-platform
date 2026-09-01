from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from apps.lessons.models import Lesson
from apps.users.models import User
from .models import WhiteboardSnapshot, WhiteboardYjsState
from .permissions import IsHocuspocus
from .serializers import WhiteboardSnapshotSerializer


class WhiteboardSnapshotView(APIView):
    """
    GET  — последний снапшот урока (для инициализации Excalidraw)
    POST — сохранить новый снапшот
    """
    permission_classes = [IsAuthenticated]

    def _get_lesson(self, lesson_pk):
        lesson = generics.get_object_or_404(Lesson, pk=lesson_pk)
        if not lesson.is_participant(self.request.user):
            self.permission_denied(self.request)
        return lesson

    def get(self, request, lesson_pk):
        lesson = self._get_lesson(lesson_pk)
        snapshot = WhiteboardSnapshot.objects.filter(lesson=lesson).first()
        if not snapshot:
            return Response({'data': {}, 'version': 0})
        return Response(WhiteboardSnapshotSerializer(snapshot).data)

    def post(self, request, lesson_pk):
        lesson = self._get_lesson(lesson_pk)
        serializer = WhiteboardSnapshotSerializer(
            data={**request.data, 'lesson': str(lesson.pk)}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ValidateAccessView(APIView):
    """
    Вызывается Hocuspocus при подключении клиента.
    Принимает и обычный JWT, и гостевой токен урока (вход по ссылке).
    Защищён X-Hocuspocus-Secret.
    """
    permission_classes = [IsHocuspocus]

    def post(self, request):
        token_str = request.data.get('token', '')
        room_id = request.data.get('room_id', '')

        if not token_str or not room_id:
            return Response(
                {'detail': 'token и room_id обязательны.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            access_token = AccessToken(token_str)
        except (InvalidToken, TokenError):
            return Response({'detail': 'Невалидный токен.'}, status=status.HTTP_403_FORBIDDEN)

        # Гостевой токен привязан к конкретной комнате и пользователя не имеет
        if access_token.get('guest'):
            if str(access_token.get('room_id')) != str(room_id):
                return Response({'detail': 'Токен от другого урока.'}, status=status.HTTP_403_FORBIDDEN)
            return Response({
                'user': {
                    'id': f'guest:{access_token["jti"]}',
                    'username': access_token.get('name') or 'Гость',
                    'role': 'guest',
                }
            })

        try:
            user = User.objects.get(id=access_token['user_id'])
        except (KeyError, User.DoesNotExist):
            return Response({'detail': 'Невалидный токен.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            lesson = Lesson.objects.select_related('teacher').get(room_id=room_id)
        except Lesson.DoesNotExist:
            return Response({'detail': 'Урок не найден.'}, status=status.HTTP_404_NOT_FOUND)

        if not lesson.is_participant(user):
            return Response({'detail': 'Нет доступа к уроку.'}, status=status.HTTP_403_FORBIDDEN)

        return Response({
            'user': {
                'id': str(user.id),
                'username': user.display_name,
                'role': user.role,
            }
        })


class YjsStateView(APIView):
    """
    GET — загрузить Yjs-состояние (вызывается Hocuspocus при первом подключении).
    PUT — сохранить Yjs-состояние (когда все клиенты отключились).
    Защищён X-Hocuspocus-Secret.
    """
    permission_classes = [IsHocuspocus]

    def get(self, request, room_id):
        try:
            lesson = Lesson.objects.get(room_id=room_id)
            yjs = WhiteboardYjsState.objects.get(lesson=lesson)
            return Response({'state': yjs.state})
        except (Lesson.DoesNotExist, WhiteboardYjsState.DoesNotExist):
            return Response({'state': None})

    def put(self, request, room_id):
        state = request.data.get('state', '')
        if not state:
            return Response({'detail': 'state обязателен.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lesson = Lesson.objects.get(room_id=room_id)
        except Lesson.DoesNotExist:
            return Response({'detail': 'Урок не найден.'}, status=status.HTTP_404_NOT_FOUND)

        WhiteboardYjsState.objects.update_or_create(
            lesson=lesson,
            defaults={'state': state},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
