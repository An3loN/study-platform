from rest_framework import serializers

from apps.users.models import User
from apps.users.serializers import UserPublicSerializer
from .models import Lesson, Homework


def next_lesson_at(homework, student=None):
    """
    Срок сдачи — ближайший следующий урок после того, на котором задано.
    Для ученика считаем по его собственным урокам, для преподавателя —
    по урокам с теми же участниками.
    """
    lesson = homework.lesson
    if lesson.scheduled_at is None:
        return None

    query = Lesson.objects.filter(
        teacher_id=lesson.teacher_id,
        scheduled_at__gt=lesson.scheduled_at,
    ).exclude(pk=lesson.pk)

    if student is not None:
        query = query.filter(students=student)
    else:
        student_ids = list(lesson.students.values_list('id', flat=True))
        if student_ids:
            query = query.filter(students__in=student_ids)

    following = query.order_by('scheduled_at').first()
    return following.scheduled_at if following else None


class HomeworkSerializer(serializers.ModelSerializer):
    lesson_title = serializers.SerializerMethodField()
    lesson_scheduled_at = serializers.DateTimeField(source='lesson.scheduled_at', read_only=True)
    due_at = serializers.SerializerMethodField()
    is_done = serializers.SerializerMethodField()
    done_by = serializers.SerializerMethodField()

    class Meta:
        model = Homework
        fields = [
            'id', 'lesson', 'lesson_title', 'lesson_scheduled_at', 'text', 'attachment',
            'due_at', 'is_done', 'done_by', 'created_at',
        ]
        read_only_fields = ['id', 'lesson', 'created_at']

    def get_lesson_title(self, obj):
        return str(obj.lesson)

    def get_due_at(self, obj):
        user = self.context['request'].user
        student = user if getattr(user, 'is_student', False) else None
        return next_lesson_at(obj, student)

    def get_is_done(self, obj):
        user = self.context['request'].user
        return obj.completed_by.filter(pk=user.pk).exists()

    def get_done_by(self, obj):
        return UserPublicSerializer(obj.completed_by.all(), many=True).data


class LessonListSerializer(serializers.ModelSerializer):
    students = UserPublicSerializer(many=True, read_only=True)
    homework_count = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'scheduled_at', 'duration', 'status', 'comment',
            'students', 'homework_count', 'created_at',
        ]

    def get_homework_count(self, obj):
        return obj.homework.count()


class LessonDetailSerializer(LessonListSerializer):
    """Заметки и ссылка на вход отдаются только преподавателю."""
    teacher = UserPublicSerializer(read_only=True)
    notes = serializers.SerializerMethodField()
    share_url = serializers.SerializerMethodField()
    share_token = serializers.SerializerMethodField()
    homework = HomeworkSerializer(many=True, read_only=True)

    class Meta(LessonListSerializer.Meta):
        fields = LessonListSerializer.Meta.fields + [
            'teacher', 'room_id', 'notes', 'share_url', 'share_token', 'homework',
        ]

    def _is_teacher(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.teacher_id == request.user.id)

    def get_notes(self, obj):
        return obj.notes if self._is_teacher(obj) else None

    def get_share_token(self, obj):
        return str(obj.share_token) if self._is_teacher(obj) else None

    def get_share_url(self, obj):
        if not self._is_teacher(obj):
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.share_path()) if request else obj.share_path()


class LessonWriteSerializer(serializers.ModelSerializer):
    """Все поля необязательные и правятся в любой момент."""
    students = serializers.PrimaryKeyRelatedField(
        many=True,
        required=False,
        queryset=User.objects.none(),
    )

    class Meta:
        model = Lesson
        fields = ['title', 'scheduled_at', 'duration', 'comment', 'notes', 'students', 'status']
        extra_kwargs = {field: {'required': False} for field in fields}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request:
            # Назначать можно только своих учеников
            self.fields['students'].child_relation.queryset = User.objects.filter(
                teacher=request.user, role=User.ROLE_STUDENT,
            )

    def create(self, validated_data):
        students = validated_data.pop('students', [])
        lesson = Lesson.objects.create(teacher=self.context['request'].user, **validated_data)
        lesson.students.set(students)
        return lesson


class LessonShareSerializer(serializers.ModelSerializer):
    """Публичная карточка урока для входящего по ссылке."""
    teacher_name = serializers.CharField(source='teacher.display_name', read_only=True)

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'scheduled_at', 'duration', 'status', 'comment', 'teacher_name']
