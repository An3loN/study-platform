from django.db.models import F
from rest_framework import serializers

from apps.users.models import User
from apps.users.serializers import UserPublicSerializer
from .models import Lesson, Homework, HomeworkSubmission, HomeworkMessage


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


class HomeworkMessageSerializer(serializers.ModelSerializer):
    """Сообщение в обсуждении задания."""
    author = UserPublicSerializer(read_only=True)

    class Meta:
        model = HomeworkMessage
        fields = ['id', 'author', 'text', 'attachment', 'created_at']
        read_only_fields = ['id', 'author', 'created_at']


class HomeworkSubmissionSerializer(serializers.ModelSerializer):
    """Как идут дела у одного ученика: его отметка, приёмка и оценка."""
    student = UserPublicSerializer(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = HomeworkSubmission
        fields = ['id', 'student', 'status', 'is_done', 'grade', 'accepted_at', 'revision_requested_at']
        read_only_fields = fields


class HomeworkSerializer(serializers.ModelSerializer):
    lesson_title = serializers.SerializerMethodField()
    lesson_scheduled_at = serializers.DateTimeField(source='lesson.scheduled_at', read_only=True)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    effective_due_at = serializers.SerializerMethodField()
    submissions = serializers.SerializerMethodField()
    my_submission = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()

    class Meta:
        model = Homework
        fields = [
            'id', 'lesson', 'lesson_title', 'lesson_scheduled_at', 'text', 'attachment',
            'due_at', 'effective_due_at', 'submissions', 'my_submission', 'messages_count',
            'created_at',
        ]
        read_only_fields = ['id', 'lesson', 'created_at']

    def get_lesson_title(self, obj):
        return str(obj.lesson)

    def get_effective_due_at(self, obj):
        """
        Срок, который показываем. Заданный вручную побеждает; пока его нет —
        считаем по следующему уроку, и тогда перенос занятия двигает срок.
        """
        if obj.due_at:
            return obj.due_at
        user = self.context['request'].user
        student = user if getattr(user, 'is_student', False) else None
        return next_lesson_at(obj, student)

    def get_submissions(self, obj):
        """Всем участникам урока: у кого что со сдачей."""
        return HomeworkSubmissionSerializer(obj.submissions.all(), many=True).data

    def get_my_submission(self, obj):
        user = self.context['request'].user
        submission = next((s for s in obj.submissions.all() if s.student_id == user.id), None)
        return HomeworkSubmissionSerializer(submission).data if submission else None

    def get_messages_count(self, obj):
        return obj.messages.count()


class LessonListSerializer(serializers.ModelSerializer):
    students = UserPublicSerializer(many=True, read_only=True)
    homework_count = serializers.SerializerMethodField()
    # status — свойство модели, считается из времени; ModelSerializer сам его не подхватит
    status = serializers.CharField(read_only=True)
    cancelled_by_name = serializers.CharField(source='cancelled_by.display_name', read_only=True, default='')

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'scheduled_at', 'duration', 'status', 'comment',
            'students', 'homework_count', 'created_at', 'has_whiteboard',
            'cancelled_at', 'cancel_reason', 'cancelled_by_name',
        ]

    def get_homework_count(self, obj):
        return obj.homework.count()


class LessonDetailSerializer(LessonListSerializer):
    """Заметки и ссылка на вход отдаются только преподавателю."""
    teacher = UserPublicSerializer(read_only=True)
    notes = serializers.SerializerMethodField()
    share_url = serializers.SerializerMethodField()
    share_token = serializers.SerializerMethodField()
    previous_notes = serializers.SerializerMethodField()
    homework = HomeworkSerializer(many=True, read_only=True)

    class Meta(LessonListSerializer.Meta):
        fields = LessonListSerializer.Meta.fields + [
            'teacher', 'room_id', 'notes', 'share_url', 'share_token', 'homework',
            'previous_notes',
        ]

    def _is_teacher(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.teacher_id == request.user.id)

    def get_notes(self, obj):
        return obj.notes if self._is_teacher(obj) else None

    def get_previous_notes(self, obj):
        """
        Заметки с прошлых занятий — чтобы не вспоминать по памяти, на чём
        остановились. Берём уроки с теми же учениками: заметки по другому
        ученику здесь только мешали бы.

        Уроки без заметок пропускаем: пустая строка в списке ничего не говорит,
        а место занимает. Поэтому «последние три» — это три последних, где
        действительно что-то записано.
        """
        if not self._is_teacher(obj):
            return []

        lessons = (
            Lesson.objects
            .filter(teacher_id=obj.teacher_id)
            .exclude(pk=obj.pk)
            .exclude(notes='')
        )

        student_ids = [student.id for student in obj.students.all()]
        if student_ids:
            lessons = lessons.filter(students__id__in=student_ids).distinct()

        # «Прошлые» — те, что раньше текущего. У урока без даты точки отсчёта
        # нет, поэтому просто показываем последние записанные.
        if obj.scheduled_at:
            lessons = lessons.filter(scheduled_at__lt=obj.scheduled_at)

        lessons = lessons.order_by(F('scheduled_at').desc(nulls_last=True), '-created_at')[:3]

        return [
            {
                'id': str(lesson.pk),
                'title': lesson.title,
                'scheduled_at': lesson.scheduled_at,
                'notes': lesson.notes,
            }
            for lesson in lessons
        ]

    def get_share_token(self, obj):
        # Без доски вход по ссылке некуда вести — не отдаём её вовсе
        if not (self._is_teacher(obj) and obj.has_whiteboard):
            return None
        return str(obj.share_token)

    def get_share_url(self, obj):
        if not (self._is_teacher(obj) and obj.has_whiteboard):
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
        fields = ['title', 'scheduled_at', 'duration', 'comment', 'notes', 'students', 'has_whiteboard']
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
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'scheduled_at', 'duration', 'status', 'comment', 'teacher_name',
            'cancelled_at', 'cancel_reason',
        ]
