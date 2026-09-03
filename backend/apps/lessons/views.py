from datetime import timedelta

from django.db.models import DateTimeField, DurationField, ExpressionWrapper, F, Q, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions, generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from apps.common.qr import qr_svg_response
from apps.users.permissions import IsTeacher
from .models import Lesson, Homework, HomeworkSubmission
from .serializers import (
    LessonListSerializer,
    LessonDetailSerializer,
    LessonWriteSerializer,
    LessonShareSerializer,
    HomeworkSerializer,
    HomeworkMessageSerializer,
)

GUEST_TOKEN_LIFETIME = timedelta(hours=12)


def issue_guest_token(lesson, name):
    """
    Гостевой токен: без пользователя, привязан к комнате урока.
    Его принимает Hocuspocus через validate-access.
    """
    token = AccessToken()
    token.set_exp(lifetime=GUEST_TOKEN_LIFETIME)
    token['guest'] = True
    token['room_id'] = str(lesson.room_id)
    token['name'] = (name or 'Гость')[:60]
    return str(token)


def lesson_ends_at():
    """
    Момент окончания урока выражением SQL: scheduled_at + длительность.
    Нужен там, где по нему фильтруют, — свойство модели в запрос не подставить.
    В annotate имя ends_at_db, а не ends_at: одноимённое свойство модели
    доступно только на чтение, и Django падает, пытаясь его присвоить.
    """
    minutes = Coalesce(F('duration'), Value(Lesson.DEFAULT_DURATION_MINUTES))
    delta = ExpressionWrapper(minutes * Value(timedelta(minutes=1)), output_field=DurationField())
    return ExpressionWrapper(F('scheduled_at') + delta, output_field=DateTimeField())


def lessons_for(user):
    if user.is_teacher:
        return Lesson.objects.filter(teacher=user)
    return Lesson.objects.filter(students=user)


class LessonListCreateView(generics.ListCreateAPIView):
    """
    GET  — уроки пользователя. ?upcoming=1 — только предстоящие,
           ?past=1 — только прошедшие, ?student=<uuid> — уроки одного ученика.
    POST — создание урока преподавателем.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            lessons_for(self.request.user)
            .prefetch_related('students', 'homework')
            .select_related('teacher')
            .distinct()
        )
        params = self.request.query_params

        if params.get('student'):
            queryset = queryset.filter(students__id=params['student'])

        now = timezone.now()
        if params.get('upcoming') or params.get('past'):
            # Статус вычисляется из времени, поэтому и фильтровать приходится по
            # нему же: сортировать в Python нельзя — сломается пагинация.
            queryset = queryset.annotate(ends_at_db=lesson_ends_at())

        if params.get('upcoming'):
            # Урок без даты считаем предстоящим: его ещё предстоит назначить.
            # Идущий сейчас урок остаётся здесь, даже если время начала прошло.
            queryset = queryset.filter(
                Q(scheduled_at__isnull=True) | Q(ends_at_db__gte=now),
            ).order_by('scheduled_at')
        elif params.get('past'):
            queryset = queryset.filter(ends_at_db__lt=now).order_by('-scheduled_at')

        return queryset

    def get_serializer_class(self):
        return LessonWriteSerializer if self.request.method == 'POST' else LessonListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsTeacher()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = serializer.save()
        return Response(
            LessonDetailSerializer(lesson, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class LessonDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Просмотр — участникам, правка и удаление — преподавателю."""
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Lesson.objects.select_related('teacher').prefetch_related('students', 'homework')

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return LessonWriteSerializer
        return LessonDetailSerializer

    def get_object(self):
        lesson = get_object_or_404(self.get_queryset(), pk=self.kwargs['pk'])
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            if lesson.teacher_id != self.request.user.id:
                self.permission_denied(self.request, message='Урок можно менять только его преподавателю.')
        elif not lesson.is_participant(self.request.user):
            self.permission_denied(self.request, message='Нет доступа к уроку.')
        return lesson

    def update(self, request, *args, **kwargs):
        lesson = self.get_object()
        serializer = self.get_serializer(lesson, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if 'students' in serializer.validated_data:
            lesson.students.set(serializer.validated_data['students'])
        lesson.refresh_from_db()
        return Response(LessonDetailSerializer(lesson, context=self.get_serializer_context()).data)


class LessonCancelView(APIView):
    """
    Отмена урока с причиной. Доступна обеим сторонам: у ученика тоже бывают
    обстоятельства, и об этом лучше узнать из системы, чем из тишины.
    Удалить урок может только преподаватель — это делает LessonDetailView.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        lesson = get_object_or_404(Lesson, pk=pk)
        if not lesson.is_participant(request.user):
            return Response({'detail': 'Нет доступа к уроку.'}, status=status.HTTP_403_FORBIDDEN)

        if lesson.cancelled_at:
            return Response({'detail': 'Урок уже отменён.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = str(request.data.get('reason', '')).strip()
        if not reason:
            return Response(
                {'detail': 'Укажите причину отмены — её увидит вторая сторона.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lesson.cancelled_at = timezone.now()
        lesson.cancelled_by = request.user
        lesson.cancel_reason = reason
        lesson.save(update_fields=['cancelled_at', 'cancelled_by', 'cancel_reason'])

        return Response(LessonDetailSerializer(lesson, context={'request': request}).data)


# ── Вход по ссылке ───────────────────────────────────────────────────────────

class ShareLinkExpired(exceptions.APIException):
    """410, а не 404: человек попал по верному адресу, просто поздно."""
    status_code = status.HTTP_410_GONE
    default_detail = 'Срок действия ссылки истёк. Попросите преподавателя прислать новую.'
    default_code = 'share_link_expired'


def get_live_lesson(share_token):
    """Урок по токену ссылки, если по ней ещё есть куда входить."""
    lesson = get_object_or_404(Lesson, share_token=share_token)
    # У очного урока доски нет, а ссылка ведёт именно на неё
    if not lesson.has_whiteboard:
        raise exceptions.NotFound('Это очный урок — входить по ссылке некуда.')
    if lesson.share_is_expired:
        raise ShareLinkExpired()
    return lesson


class LessonShareInfoView(APIView):
    """Публично: карточка урока по токену ссылки."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, share_token):
        lesson = get_live_lesson(share_token)
        return Response(LessonShareSerializer(lesson).data)


class LessonGuestJoinView(APIView):
    """Публично: представился именем — получил гостевой доступ к доске."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, share_token):
        lesson = get_live_lesson(share_token)
        name = str(request.data.get('name', '')).strip()
        if not name:
            return Response({'detail': 'Представьтесь, пожалуйста.'}, status=status.HTTP_400_BAD_REQUEST)

        # Завершённый урок больше не закрывает вход: статус теперь вычисляется
        # из времени, и урок, затянувшийся на десять минут, иначе выставлял бы
        # опоздавшего за дверь. Доступом управляет срок жизни ссылки.
        return Response({
            'access': issue_guest_token(lesson, name),
            'name': name,
            'lesson': LessonShareSerializer(lesson).data,
            'room_id': str(lesson.room_id),
        })


class LessonShareQrView(APIView):
    """Публично: QR со ссылкой на вход (секрет — сам токен в адресе)."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, share_token):
        lesson = get_live_lesson(share_token)
        return qr_svg_response(request.build_absolute_uri(lesson.share_path()))


# ── Домашние задания ─────────────────────────────────────────────────────────

class HomeworkListCreateView(generics.ListCreateAPIView):
    """ДЗ конкретного урока: список — участникам, создание — преподавателю."""
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_lesson(self):
        lesson = get_object_or_404(Lesson, pk=self.kwargs['lesson_pk'])
        if not lesson.is_participant(self.request.user):
            self.permission_denied(self.request, message='Нет доступа к уроку.')
        return lesson

    def get_queryset(self):
        return self.get_lesson().homework.prefetch_related('submissions__student', 'messages', 'lesson__students', 'students')

    def perform_create(self, serializer):
        lesson = self.get_lesson()
        if lesson.teacher_id != self.request.user.id:
            self.permission_denied(self.request, message='Задание может добавить только преподаватель.')
        # Адресаты у задания с уроком берутся из самого урока, поэтому список
        # учеников тут не принимаем даже если его прислали
        serializer.save(lesson=lesson, teacher=lesson.teacher, students=[])


class HomeworkDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Правка и удаление задания — преподавателю, который его задал."""
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Homework.objects.select_related('lesson').prefetch_related('submissions__student', 'messages', 'lesson__students', 'students')

    def get_object(self):
        homework = get_object_or_404(self.get_queryset(), pk=self.kwargs['pk'])
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            if homework.teacher_id != self.request.user.id:
                self.permission_denied(self.request)
        elif not homework.is_participant(self.request.user):
            self.permission_denied(self.request)
        return homework


def get_homework_for(user, pk, teacher_only=False):
    """Задание, если пользователь имеет к нему отношение."""
    homework = get_object_or_404(
        Homework.objects.select_related('lesson').prefetch_related('submissions__student', 'messages', 'lesson__students', 'students'),
        pk=pk,
    )
    if teacher_only:
        if homework.teacher_id != user.id:
            raise exceptions.PermissionDenied('Это может только преподаватель.')
    elif not homework.is_participant(user):
        raise exceptions.PermissionDenied('Нет доступа к заданию.')
    return homework


class HomeworkDoneView(APIView):
    """
    Ученик отмечает задание выполненным или снимает отметку.
    Отметка — заявка на проверку, а не приёмка: принимает преподаватель.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        homework = get_homework_for(request.user, pk)

        done = bool(request.data.get('done', True))
        submission, _ = HomeworkSubmission.objects.get_or_create(
            homework=homework, student=request.user,
        )
        submission.is_done = done
        submission.done_at = timezone.now() if done else None
        if done:
            # Отметил заново — значит поправки внесены
            submission.revision_requested_at = None
        else:
            # Снял отметку сам — приёмка больше не актуальна
            submission.accepted_at = None
        submission.save()

        homework.refresh_from_db()
        return Response(HomeworkSerializer(homework, context={'request': request}).data)


class HomeworkReviewView(APIView):
    """
    Преподаватель принимает работу или отправляет на поправки.

    Приёмка может нести оценку по пятибалльной шкале — необязательную:
    отметить «сделано» и не ставить балл это нормальный исход.
    Требование поправок снимает отметку ученика, чтобы он проставил её заново,
    когда исправит.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        homework = get_homework_for(request.user, pk, teacher_only=True)

        student_id = request.data.get('student')
        if not student_id:
            return Response({'detail': 'Не указан ученик.'}, status=status.HTTP_400_BAD_REQUEST)
        if not homework.student_set.filter(pk=student_id).exists():
            return Response({'detail': 'Этому ученику задание не задавали.'}, status=status.HTTP_400_BAD_REQUEST)

        accepted = bool(request.data.get('accepted', False))
        grade = request.data.get('grade')
        if grade not in (None, ''):
            try:
                grade = int(grade)
            except (TypeError, ValueError):
                return Response({'detail': 'Оценка должна быть числом.'}, status=status.HTTP_400_BAD_REQUEST)
            if not 1 <= grade <= 5:
                return Response({'detail': 'Оценка — от 1 до 5.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            grade = None

        submission, _ = HomeworkSubmission.objects.get_or_create(
            homework=homework, student_id=student_id,
        )

        if accepted:
            submission.accepted_at = timezone.now()
            submission.revision_requested_at = None
            submission.grade = grade
            # Принято — значит сделано, даже если ученик забыл отметить
            submission.is_done = True
        else:
            submission.accepted_at = None
            submission.revision_requested_at = timezone.now()
            submission.is_done = False
            submission.done_at = None
        submission.save()

        homework.refresh_from_db()
        return Response(HomeworkSerializer(homework, context={'request': request}).data)


class HomeworkMessageListCreateView(generics.ListCreateAPIView):
    """
    Обсуждение задания — по одной ветке на ученика.

    Ученик всегда попадает в свою и другой указать не может. Преподаватель
    выбирает ветку параметром `student`: он говорит с каждым отдельно.
    """
    serializer_class = HomeworkMessageSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_homework(self):
        return get_homework_for(self.request.user, self.kwargs['pk'])

    def get_thread_student(self, homework):
        """Чья ветка. Для ученика — своя, для преподавателя — из запроса."""
        user = self.request.user
        if homework.teacher_id != user.id:
            return user.id

        student_id = self.request.query_params.get('student') or self.request.data.get('student')
        if not student_id:
            raise exceptions.ValidationError({'detail': 'Не указан ученик.'})
        if not homework.student_set.filter(pk=student_id).exists():
            raise exceptions.ValidationError({'detail': 'Этому ученику задание не задавали.'})
        return student_id

    def get_queryset(self):
        homework = self.get_homework()
        student_id = self.get_thread_student(homework)
        # Сообщения без ветки остались от общей переписки — показываем всем
        return (
            homework.messages
            .filter(Q(student_id=student_id) | Q(student__isnull=True))
            .select_related('author')
        )

    def perform_create(self, serializer):
        homework = self.get_homework()
        student_id = self.get_thread_student(homework)
        if not serializer.validated_data.get('text', '').strip() and not self.request.FILES.get('attachment'):
            raise exceptions.ValidationError({'detail': 'Пустое сообщение отправлять некуда.'})
        serializer.save(homework=homework, author=self.request.user, student_id=student_id)


class MyHomeworkListView(generics.ListCreateAPIView):
    """
    GET  — домашние задания пользователя, и привязанные к уроку, и нет.
    POST — задание без урока: преподаватель сам перечисляет, кому задаёт.
           Задание к занятию создаётся своим маршрутом, там адресаты уже
           известны из урока.
    """
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        # Преподавателю — всё, что он задал; ученику — заданное ему, через
        # урок или напрямую
        mine = Q(teacher=user) if user.is_teacher else (Q(lesson__students=user) | Q(students=user))
        return (
            Homework.objects
            .filter(mine)
            .select_related('lesson', 'teacher')
            .prefetch_related('submissions__student', 'messages', 'lesson__students', 'students')
            .distinct()
        )

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsTeacher()]
        return super().get_permissions()

    def perform_create(self, serializer):
        if not serializer.validated_data.get('students'):
            raise exceptions.ValidationError(
                {'students': 'Укажите, кому задано: без урока адресатов взять неоткуда.'},
            )
        serializer.save(teacher=self.request.user)
