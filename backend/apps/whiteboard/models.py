from django.db import models
from apps.lessons.models import Lesson


class WhiteboardYjsState(models.Model):
    """
    Состояние Yjs-документа доски — Y.encodeStateAsUpdate(doc) как есть.

    Хранится байтами (bytea), а не base64-текстом: base64 длиннее на треть,
    а Hocuspocus перезаписывает документ целиком каждые полминуты урока.
    base64 остался только на проводе между Hocuspocus и Django (JSON).
    """
    lesson = models.OneToOneField(
        Lesson,
        on_delete=models.CASCADE,
        related_name='yjs_state',
        verbose_name='Урок',
    )
    state = models.BinaryField(verbose_name='Yjs state')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Yjs-состояние доски'
        verbose_name_plural = 'Yjs-состояния досок'

    def __str__(self):
        return f'YjsState — {self.lesson}'
