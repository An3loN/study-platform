import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Lesson(models.Model):
    """
    Занятие с преподавателем. К темам и курсам не привязано: время, длительность,
    ученики и комментарий — всё необязательно и правится в любой момент.
    """
    STATUS_SCHEDULED = 'scheduled'
    STATUS_ACTIVE = 'active'
    STATUS_FINISHED = 'finished'

    # Длительность необязательна: если её не задали, считаем урок часовым.
    # Нужно только чтобы понять, когда он закончился (см. ends_at).
    DEFAULT_DURATION_MINUTES = 60

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='taught_lessons',
        verbose_name='Преподаватель',
    )
    students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='lessons',
        blank=True,
        verbose_name='Ученики',
    )

    title = models.CharField(max_length=200, blank=True, verbose_name='Тема')
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата и время')
    duration = models.PositiveIntegerField(null=True, blank=True, verbose_name='Длительность (мин)')
    # Ссылка на аудиоконференцию и прочие пометки, видные ученику
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    # Быстрые заметки преподавателя: что прошли, на что обратить внимание. Ученику не видны.
    notes = models.TextField(blank=True, verbose_name='Заметки преподавателя')

    room_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    # Токен для входа на урок по ссылке, в том числе без аккаунта
    share_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    share_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Ссылка действует до',
        help_text=(
            'Пусто — считается от конца урока по настройкам платформы. '
            'Заполните, чтобы задать свой срок для этого урока.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Урок'
        verbose_name_plural = 'Уроки'
        ordering = ['-scheduled_at', '-created_at']

    def __str__(self):
        when = self.scheduled_at.strftime('%d.%m.%Y %H:%M') if self.scheduled_at else 'без даты'
        return self.title or f'Урок {when}'

    @property
    def ends_at(self):
        """Когда урок заканчивается. None — время начала не назначено."""
        if not self.scheduled_at:
            return None
        minutes = self.duration or self.DEFAULT_DURATION_MINUTES
        return self.scheduled_at + timedelta(minutes=minutes)

    @property
    def status(self):
        """
        Статус считается из времени, а не хранится: раньше преподаватель
        переключал его руками, и урок, у которого просто закрыли вкладку,
        навсегда оставался «идёт».

        Урок без даты — всегда «запланирован»: его ещё предстоит назначить.
        """
        if not self.scheduled_at:
            return self.STATUS_SCHEDULED
        now = timezone.now()
        if now < self.scheduled_at:
            return self.STATUS_SCHEDULED
        if now < self.ends_at:
            return self.STATUS_ACTIVE
        return self.STATUS_FINISHED

    @property
    def share_valid_until(self):
        """
        До какого момента работает ссылка на вход. None — бессрочно.

        Срок считается от конца урока, а не от создания ссылки: иначе ссылка
        на урок через неделю протухла бы задолго до самого урока. Поэтому и не
        сохраняется в поле — перенос урока должен двигать её вместе с собой.
        Явно заданный share_expires_at перекрывает расчёт.
        """
        if self.share_expires_at:
            return self.share_expires_at

        from apps.common.models import SiteSettings
        days = SiteSettings.get().share_ttl_days
        if not days:
            return None
        return (self.ends_at or self.created_at) + timedelta(days=days)

    @property
    def share_is_expired(self):
        valid_until = self.share_valid_until
        return valid_until is not None and timezone.now() >= valid_until

    def is_participant(self, user):
        if not user or not user.is_authenticated:
            return False
        return self.teacher_id == user.id or self.students.filter(pk=user.pk).exists()

    def share_path(self):
        return f'/j/{self.share_token}'


class Homework(models.Model):
    """
    Домашнее задание крепится к уроку, на котором задано.
    Срок — следующий урок ученика (считается на лету, см. сериализатор).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='homework',
        verbose_name='Урок',
    )
    text = models.TextField(blank=True, verbose_name='Задание')
    attachment = models.FileField(
        upload_to='homework/%Y/%m/',
        null=True,
        blank=True,
        verbose_name='Файл',
    )
    completed_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='completed_homework',
        blank=True,
        verbose_name='Отметили выполненным',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Домашнее задание'
        verbose_name_plural = 'Домашние задания'
        ordering = ['-created_at']

    def __str__(self):
        return f'ДЗ к уроку {self.lesson}'
