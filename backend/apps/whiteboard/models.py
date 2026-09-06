from django.db import models
from apps.lessons.models import Lesson


class WhiteboardYjsState(models.Model):
    """Бинарное состояние Yjs-документа (base64). Используется Hocuspocus для персистентности."""
    lesson = models.OneToOneField(
        Lesson,
        on_delete=models.CASCADE,
        related_name='yjs_state',
        verbose_name='Урок',
    )
    # Base64-кодированный Y.encodeStateAsUpdate(doc)
    state = models.TextField(verbose_name='Yjs state (base64)')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Yjs-состояние доски'
        verbose_name_plural = 'Yjs-состояния досок'

    def __str__(self):
        return f'YjsState — {self.lesson}'
