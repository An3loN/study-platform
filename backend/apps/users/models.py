import re
import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


def normalize_phone(phone):
    """+7 (999) 123-45-67 → +79991234567. Пустое значение → None (для unique)."""
    if not phone:
        return None
    cleaned = re.sub(r'[^\d+]', '', str(phone))
    return cleaned or None


class User(AbstractUser):
    ROLE_STUDENT = 'student'
    ROLE_TEACHER = 'teacher'
    ROLE_CHOICES = [
        (ROLE_STUDENT, 'Студент'),
        (ROLE_TEACHER, 'Преподаватель'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)

    # Телефон — логин. У ученика, заведённого преподавателем, его может ещё не быть,
    # поэтому null (в Postgres несколько NULL не нарушают unique).
    phone = models.CharField('Телефон', max_length=32, unique=True, null=True, blank=True)
    alias = models.CharField('Псевдоним', max_length=100, blank=True)

    # Преподаватель, который завёл этого ученика
    teacher = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='students',
        verbose_name='Преподаватель',
    )

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)

    @property
    def is_teacher(self):
        return self.role == self.ROLE_TEACHER

    @property
    def is_student(self):
        return self.role == self.ROLE_STUDENT

    @property
    def display_name(self):
        """Как показывать пользователя в интерфейсе."""
        full_name = f'{self.first_name} {self.last_name}'.strip()
        return self.alias or full_name or self.phone or self.username

    def __str__(self):
        return self.display_name


class StudentInvite(models.Model):
    """
    Приглашение ученика: преподаватель заводит карточку, ученик по ссылке
    (или QR-коду с той же ссылкой) заполняет свои данные и задаёт пароль.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='invites',
        verbose_name='Ученик',
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True, verbose_name='Принято')

    class Meta:
        verbose_name = 'Приглашение ученика'
        verbose_name_plural = 'Приглашения учеников'
        ordering = ['-created_at']

    @property
    def is_accepted(self):
        return self.accepted_at is not None

    def path(self):
        return f'/invite/{self.token}'

    def __str__(self):
        return f'Приглашение для {self.student}'
