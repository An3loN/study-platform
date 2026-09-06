import re
import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone


def normalize_phone(phone):
    """+7 (999) 123-45-67 → +79991234567. Пустое значение → None (для unique)."""
    if not phone:
        return None
    cleaned = re.sub(r'[^\d+]', '', str(phone))
    return cleaned or None


class PhoneUserManager(UserManager):
    """
    Менеджер под вход по телефону: поля `username` у модели нет, а базовый
    `UserManager` требует его первым позиционным аргументом — иначе падает и
    `createsuperuser`, и всё, что зовёт `create_user`.
    """

    def create_user(self, phone=None, email=None, password=None, **extra_fields):
        # Телефон необязателен: карточку ученика преподаватель заводит раньше,
        # чем тот зарегистрируется, и до этого момента логина у ученика нет.
        # В Postgres несколько NULL не нарушают unique, так что таких может
        # быть сколько угодно.
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user_object(phone, email, password, **extra_fields)

    def create_superuser(self, phone=None, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        # Суперпользователь заводит учеников, то есть ведёт занятия
        extra_fields.setdefault('role', User.ROLE_TEACHER)
        if not extra_fields['is_staff'] or not extra_fields['is_superuser']:
            raise ValueError('Суперпользователь должен быть is_staff и is_superuser.')
        # А вот ему телефон нужен: он же логин, и войти без него некуда
        if not phone:
            raise ValueError('Телефон обязателен: суперпользователю им входить.')
        return self._create_user_object(phone, email, password, **extra_fields)

    def _create_user_object(self, phone, email, password, **extra_fields):
        user = self.model(
            phone=normalize_phone(phone),
            email=self.normalize_email(email) if email else '',
            **extra_fields,
        )
        # Ученику, которого завёл преподаватель, пароль ставят позже — по
        # приглашению или руками преподавателя
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user


class User(AbstractUser):
    ROLE_STUDENT = 'student'
    ROLE_TEACHER = 'teacher'
    ROLE_CHOICES = [
        (ROLE_STUDENT, 'Студент'),
        (ROLE_TEACHER, 'Преподаватель'),
    ]

    # Логин — телефон, поэтому username из AbstractUser убран совсем: он был
    # техническим полем и заполнялся мусором вида «student-3f2a91c8b4»
    username = None
    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = []

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)

    # Телефон — логин. У ученика, заведённого преподавателем, его может ещё не быть,
    # поэтому null (в Postgres несколько NULL не нарушают unique).
    phone = models.CharField('Телефон', max_length=32, unique=True, null=True, blank=True)
    alias = models.CharField('Псевдоним', max_length=100, blank=True)

    # Сколько длится урок с этим учеником по умолчанию: подставляется в форму
    # нового урока, чтобы не выставлять одно и то же каждый раз. Пусто —
    # подставляем общее значение Lesson.DEFAULT_DURATION_MINUTES.
    default_lesson_duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Длительность урока по умолчанию, мин',
    )

    # Преподаватель, который завёл этого ученика
    teacher = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='students',
        verbose_name='Преподаватель',
    )

    objects = PhoneUserManager()

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)

    def clean(self):
        # AbstractBaseUser.clean() прогоняет USERNAME_FIELD через
        # normalize_username, а у ученика без телефона это превратило бы None
        # в строку «None» — и два таких ученика столкнулись бы на unique
        self.phone = normalize_phone(self.phone)
        self.email = self.__class__.objects.normalize_email(self.email)

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
        return self.alias or full_name or self.phone or 'Без имени'

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
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Действует до',
        help_text='Пусто — бессрочно. Проставляется при выдаче из настроек платформы.',
    )

    class Meta:
        verbose_name = 'Приглашение ученика'
        verbose_name_plural = 'Приглашения учеников'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # Срок проставляется один раз, при выдаче: если считать его на лету от
        # текущей настройки, её уменьшение погасило бы уже разосланные ссылки.
        # Очищенное вручную поле означает «бессрочно» и заново не заполняется.
        if self._state.adding and self.expires_at is None:
            from apps.common.models import SiteSettings
            days = SiteSettings.get().invite_ttl_days
            if days:
                self.expires_at = timezone.now() + timedelta(days=days)
        super().save(*args, **kwargs)

    @property
    def is_accepted(self):
        return self.accepted_at is not None

    @property
    def is_expired(self):
        return self.expires_at is not None and timezone.now() >= self.expires_at

    def path(self):
        return f'/invite/{self.token}'

    def __str__(self):
        return f'Приглашение для {self.student}'
