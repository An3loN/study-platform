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

    У задания без урока отсчёт идёт от момента, когда его выдали: «до
    следующего занятия» там означает ровно то же самое.
    """
    lesson = homework.lesson
    after = lesson.scheduled_at if lesson else homework.created_at
    if after is None:
        return None

    query = Lesson.objects.filter(teacher_id=homework.teacher_id, scheduled_at__gt=after)
    if lesson:
        query = query.exclude(pk=lesson.pk)

    if student is not None:
        query = query.filter(students=student)
    else:
        student_ids = list(homework.student_set.values_list('id', flat=True))
        if student_ids:
            query = query.filter(students__in=student_ids)

    following = query.order_by('scheduled_at').first()
    return following.scheduled_at if following else None


def thread_messages(homework, student_id):
    """
    Ветка обсуждения по паре «задание + ученик». Сообщения без ветки — те,
    что написаны до её появления, — показываем в любой: адресата у них нет.
    """
    return [
        message for message in homework.messages.all()
        if message.student_id in (student_id, None)
    ]


def attachment_url(message, request):
    if not message.attachment:
        return None
    url = message.attachment.url
    return request.build_absolute_uri(url) if request else url


class HomeworkMessageSerializer(serializers.ModelSerializer):
    """Сообщение в обсуждении задания."""
    author = UserPublicSerializer(read_only=True)
    # Имя файла показываем как есть: «216-новое.jpg» говорит больше, чем «файл»
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = HomeworkMessage
        fields = ['id', 'author', 'text', 'attachment', 'attachment_name', 'created_at']
        read_only_fields = ['id', 'author', 'created_at']

    def get_attachment_name(self, obj):
        return obj.attachment.name.rsplit('/', 1)[-1] if obj.attachment else None


class HomeworkSubmissionSerializer(serializers.ModelSerializer):
    """
    Как идут дела у одного ученика: его отметка, приёмка, оценка — и то, что
    он прислал. Работа отдельным полем не хранится: присланное живёт файлами
    в его ветке обсуждения, поэтому собираем их оттуда.
    """
    student = UserPublicSerializer(read_only=True)
    status = serializers.CharField(read_only=True)
    files = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()

    class Meta:
        model = HomeworkSubmission
        fields = [
            'id', 'student', 'status', 'is_done', 'done_at', 'grade',
            'accepted_at', 'revision_requested_at', 'files', 'messages_count',
        ]
        read_only_fields = fields

    def _thread(self, obj):
        return thread_messages(obj.homework, obj.student_id)

    def get_files(self, obj):
        """Файлы самого ученика — присланная работа. Файлы преподавателя это
        замечания к ней, им в списке работ не место."""
        request = self.context.get('request')
        return [
            {
                'id': str(message.pk),
                'url': attachment_url(message, request),
                'name': message.attachment.name.rsplit('/', 1)[-1],
                'created_at': message.created_at,
            }
            for message in self._thread(obj)
            if message.attachment and message.author_id == obj.student_id
        ]

    def get_messages_count(self, obj):
        return len(self._thread(obj))


class HomeworkSerializer(serializers.ModelSerializer):
    """
    Урока у задания может не быть, поэтому всё, что раньше выводилось из него,
    берётся у самого задания: преподаватель — из своего поля, адресаты — из
    `student_set`. Поля урока в таком случае приходят пустыми.
    """
    lesson_title = serializers.SerializerMethodField()
    lesson_scheduled_at = serializers.SerializerMethodField()
    # Собеседник ученика в обсуждении: окно задания открывается и там, где
    # самого урока под рукой нет
    teacher = UserPublicSerializer(read_only=True)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    effective_due_at = serializers.SerializerMethodField()
    submissions = serializers.SerializerMethodField()
    my_submission = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()
    # Только на запись и только для заданий без урока: у задания с уроком поле
    # пустое, и отдавать его наружу значило бы врать, что адресатов нет.
    # Кому задано на самом деле, видно по `submissions`.
    students = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        queryset=User.objects.none(),
    )

    class Meta:
        model = Homework
        fields = [
            'id', 'lesson', 'lesson_title', 'lesson_scheduled_at', 'teacher', 'text', 'attachment',
            'due_at', 'effective_due_at', 'submissions', 'my_submission', 'messages_count',
            'students', 'created_at',
        ]
        read_only_fields = ['id', 'lesson', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Задать домашку можно только своим ученикам
            self.fields['students'].child_relation.queryset = User.objects.filter(
                teacher=request.user, role=User.ROLE_STUDENT,
            )

    def get_lesson_title(self, obj):
        return str(obj.lesson) if obj.lesson_id else None

    def get_lesson_scheduled_at(self, obj):
        return obj.lesson.scheduled_at if obj.lesson_id else None

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

    def _submission_for(self, obj, student):
        """
        Строка сдачи есть не у всех: она заводится, когда ученик первый раз
        отметился или преподаватель первый раз проверил. «Ещё ничего не
        прислал» — тоже состояние, и показать его надо, поэтому недостающие
        достраиваем несохранёнными.
        """
        existing = next((s for s in obj.submissions.all() if s.student_id == student.id), None)
        return existing or HomeworkSubmission(homework=obj, student=student)

    def get_submissions(self, obj):
        """
        Преподавателю — строка на каждого, кому задано, включая тех, кто
        ничего не присылал. Ученику — только своя: чужие оценки и работы его
        не касаются.
        """
        user = self.context['request'].user
        students = list(obj.student_set.all())
        if obj.teacher_id != user.id:
            students = [student for student in students if student.id == user.id]
        return HomeworkSubmissionSerializer(
            [self._submission_for(obj, student) for student in students],
            many=True,
            context=self.context,
        ).data

    def get_my_submission(self, obj):
        user = self.context['request'].user
        submission = next((s for s in obj.submissions.all() if s.student_id == user.id), None)
        if submission is None and obj.student_set.filter(pk=user.pk).exists():
            submission = HomeworkSubmission(homework=obj, student=user)
        if submission is None:
            return None
        return HomeworkSubmissionSerializer(submission, context=self.context).data

    def get_messages_count(self, obj):
        """Ученику считаем его ветку: чужие обсуждения он не видит и в счёт
        их брать нельзя."""
        user = self.context['request'].user
        if obj.teacher_id == user.id:
            return obj.messages.count()
        return len(thread_messages(obj, user.id))


class LessonListSerializer(serializers.ModelSerializer):
    students = UserPublicSerializer(many=True, read_only=True)
    homework_count = serializers.SerializerMethodField()
    # status — свойство модели, считается из времени; ModelSerializer сам его не подхватит
    status = serializers.CharField(read_only=True)
    cancelled_by_name = serializers.CharField(source='cancelled_by.display_name', read_only=True, default='')
    # Ученику важно, с кем занятие: в списке уроков преподаватель не выводится иначе
    teacher_name = serializers.CharField(source='teacher.display_name', read_only=True)

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'scheduled_at', 'duration', 'status', 'comment',
            'students', 'homework_count', 'created_at', 'has_whiteboard',
            'cancelled_at', 'cancel_reason', 'cancelled_by_name', 'teacher_name',
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
