from django.db import models
from apps.lessons.models import Lesson


class WhiteboardSnapshot(models.Model):
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='snapshots',
        verbose_name='Урок',
    )
    # Полное состояние Excalidraw: { elements: [...], appState: {...}, files: {...} }
    data = models.JSONField(default=dict, verbose_name='Данные доски')
    version = models.PositiveIntegerField(default=1, verbose_name='Версия')
    saved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Снапшот доски'
        verbose_name_plural = 'Снапшоты досок'
        get_latest_by = 'version'
        ordering = ['-version']

    def __str__(self):
        return f'Снапшот #{self.version} — {self.lesson}'


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
