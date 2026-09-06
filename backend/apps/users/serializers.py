from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, StudentInvite, normalize_phone


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class UserPublicSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'alias', 'display_name', 'avatar', 'role']


class UserProfileSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'first_name', 'last_name', 'alias', 'display_name',
            'phone', 'avatar', 'bio', 'role',
        ]
        read_only_fields = ['id', 'role', 'phone']


class LoginSerializer(serializers.Serializer):
    """Вход по телефону: он же USERNAME_FIELD."""
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        phone = normalize_phone(attrs['phone'])
        user = User.objects.filter(phone=phone).first()
        if not user or not user.is_active or not user.check_password(attrs['password']):
            raise AuthenticationFailed('Неверный телефон или пароль.')
        return issue_tokens(user)


class StudentSerializer(serializers.ModelSerializer):
    """
    Карточка ученика у преподавателя. Она же принимает правки со страницы
    ученика, включая пароль: восстановления по SMS нет, сбрасывает
    преподаватель — об этом прямо сказано на экране входа.
    """
    display_name = serializers.CharField(read_only=True)
    lessons_count = serializers.IntegerField(read_only=True)
    is_registered = serializers.SerializerMethodField()
    invite_token = serializers.SerializerMethodField()
    invite_url = serializers.SerializerMethodField()
    invite_expires_at = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'first_name', 'last_name', 'alias', 'display_name', 'phone',
            'default_lesson_duration', 'lessons_count', 'is_registered',
            'invite_token', 'invite_url', 'invite_expires_at', 'password',
            'date_joined',
        ]
        read_only_fields = ['date_joined']

    def get_invite_expires_at(self, obj):
        invite = self._invite(obj)
        return invite.expires_at if invite else None

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if phone and User.objects.filter(phone=phone).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Пользователь с таким телефоном уже есть.')
        return phone

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop('password', '')
        student = super().update(instance, validated_data)
        if password:
            student.set_password(password)
            student.save(update_fields=['password'])
        return student

    def get_is_registered(self, obj):
        return obj.has_usable_password() and bool(obj.phone)

    def _invite(self, obj):
        # Приглашение живёт, пока ученик не завершил регистрацию
        return obj.invites.filter(accepted_at__isnull=True).first()

    def get_invite_token(self, obj):
        invite = self._invite(obj)
        return str(invite.token) if invite else None

    def get_invite_url(self, obj):
        invite = self._invite(obj)
        if not invite:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(invite.path()) if request else invite.path()


class StudentCreateSerializer(serializers.ModelSerializer):
    """
    Преподаватель заводит ученика. Все поля необязательные: можно заполнить
    самому, а можно отдать ссылку и дать ученику заполнить всё за себя.
    """
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'alias', 'phone', 'password', 'default_lesson_duration']
        extra_kwargs = {
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'alias': {'required': False, 'allow_blank': True},
            'phone': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if phone and User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError('Пользователь с таким телефоном уже есть.')
        return phone

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', '')
        student = User(
            role=User.ROLE_STUDENT,
            teacher=self.context['request'].user,
            **validated_data,
        )
        if password:
            student.set_password(password)
        else:
            student.set_unusable_password()
        student.save()
        StudentInvite.objects.create(student=student)
        return student


class InviteInfoSerializer(serializers.ModelSerializer):
    """Что видит ученик, открыв ссылку-приглашение."""
    teacher_name = serializers.SerializerMethodField()
    first_name = serializers.CharField(source='student.first_name', read_only=True)
    last_name = serializers.CharField(source='student.last_name', read_only=True)
    alias = serializers.CharField(source='student.alias', read_only=True)
    phone = serializers.CharField(source='student.phone', read_only=True)
    is_accepted = serializers.BooleanField(read_only=True)

    class Meta:
        model = StudentInvite
        fields = ['token', 'teacher_name', 'first_name', 'last_name', 'alias', 'phone', 'is_accepted']

    def get_teacher_name(self, obj):
        teacher = obj.student.teacher
        return teacher.display_name if teacher else ''


class InviteAcceptSerializer(serializers.Serializer):
    """Регистрация ученика по ссылке: те же поля, что и у преподавателя в форме."""
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    alias = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if not phone:
            raise serializers.ValidationError('Телефон обязателен — по нему вход.')
        student = self.context['invite'].student
        if User.objects.filter(phone=phone).exclude(pk=student.pk).exists():
            raise serializers.ValidationError('Пользователь с таким телефоном уже есть.')
        return phone

    def save(self, **kwargs):
        invite = self.context['invite']
        student = invite.student
        data = self.validated_data

        for field in ('first_name', 'last_name', 'alias'):
            if data.get(field):
                setattr(student, field, data[field])
        student.phone = data['phone']
        student.set_password(data['password'])
        student.save()

        invite.accepted_at = timezone.now()
        invite.save(update_fields=['accepted_at'])
        return student
