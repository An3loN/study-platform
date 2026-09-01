import uuid

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


class LessonConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket комнаты урока: чат, присутствие, статус урока.
    Подключение: ws://.../ws/lesson/<room_id>/?token=<jwt|гостевой токен>
    """

    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.group_name = f'lesson_{self.room_id}'
        self.guest = self.scope.get('guest')
        user = self.scope['user']

        if self.guest:
            # Гостевой токен действует только в своей комнате
            if self.guest['room_id'] != str(self.room_id):
                await self.close(code=4003)
                return
            self.user_id = self.guest['id']
            self.username = self.guest['name']
        else:
            if isinstance(user, AnonymousUser):
                await self.close(code=4001)
                return
            if not await self._check_access():
                await self.close(code=4003)
                return
            self.user_id = str(user.id)
            self.username = user.display_name

        # Одно подключение, а не один пользователь: у человека может быть
        # открыто две вкладки, и уход одной не должен убирать его из списка
        self.connection_id = uuid.uuid4().hex

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Здороваемся со всей комнатой. Кто уже здесь — добавит нас к себе
        # и ответит нам напрямую, так новичок узнаёт текущий состав.
        await self.channel_layer.group_send(self.group_name, {
            'type': 'presence.hello',
            'connection_id': self.connection_id,
            'user_id': self.user_id,
            'username': self.username,
            'reply_to': self.channel_name,
        })

    async def disconnect(self, close_code):
        if not hasattr(self, 'group_name') or not hasattr(self, 'user_id'):
            return
        await self.channel_layer.group_send(self.group_name, {
            'type': 'presence.leave',
            'connection_id': self.connection_id,
            'user_id': self.user_id,
            'username': self.username,
        })
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content):
        handlers = {
            'chat.message': self._handle_chat,
            'lesson.start': self._handle_lesson_start,
            'lesson.finish': self._handle_lesson_finish,
        }
        handler = handlers.get(content.get('type'))
        if handler:
            await handler(content)

    # ── Входящие обработчики ──────────────────────────────────────────────

    async def _handle_chat(self, content):
        message = str(content.get('message', '')).strip()
        if not message:
            return
        await self.channel_layer.group_send(self.group_name, {
            'type': 'chat.message',
            'message': message,
            'user_id': self.user_id,
            'username': self.username,
        })

    async def _handle_lesson_start(self, content):
        await self._set_status('active')

    async def _handle_lesson_finish(self, content):
        await self._set_status('finished')

    async def _set_status(self, new_status):
        user = self.scope['user']
        if self.guest or isinstance(user, AnonymousUser) or not user.is_teacher:
            return
        await self._update_lesson_status(new_status)
        await self.channel_layer.group_send(self.group_name, {
            'type': 'lesson.status',
            'status': new_status,
        })

    # ── Исходящие обработчики (channel layer → WebSocket) ─────────────────
    # Наружу отдаём camelCase: фронт работает с camelCase-полями (см. types/index.ts).

    async def chat_message(self, event):
        await self.send_json({
            'type': 'chat.message',
            'message': event['message'],
            'userId': event['user_id'],
            'username': event['username'],
        })

    async def presence_hello(self, event):
        """Кто-то вошёл: показываем его у себя и отвечаем ему, что мы тоже здесь."""
        await self.send_json({
            'type': 'presence.join',
            'connectionId': event['connection_id'],
            'userId': event['user_id'],
            'username': event['username'],
        })

        if event['reply_to'] == self.channel_name:
            return  # это наше собственное приветствие

        await self.channel_layer.send(event['reply_to'], {
            'type': 'presence.join',
            'connection_id': self.connection_id,
            'user_id': self.user_id,
            'username': self.username,
        })

    async def presence_join(self, event):
        await self.send_json({
            'type': 'presence.join',
            'connectionId': event['connection_id'],
            'userId': event['user_id'],
            'username': event['username'],
        })

    async def presence_leave(self, event):
        await self.send_json({
            'type': 'presence.leave',
            'connectionId': event['connection_id'],
            'userId': event['user_id'],
            'username': event['username'],
        })

    async def lesson_status(self, event):
        await self.send_json({
            'type': 'lesson.status',
            'status': event['status'],
        })

    # ── DB helpers ────────────────────────────────────────────────────────

    @database_sync_to_async
    def _check_access(self):
        from apps.lessons.models import Lesson
        try:
            lesson = Lesson.objects.select_related('teacher').get(room_id=self.room_id)
            return lesson.is_participant(self.scope['user'])
        except Lesson.DoesNotExist:
            return False

    @database_sync_to_async
    def _update_lesson_status(self, new_status):
        from apps.lessons.models import Lesson
        Lesson.objects.filter(room_id=self.room_id).update(status=new_status)
