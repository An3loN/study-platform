from datetime import timedelta

from django.db.models import DateTimeField, DurationField, ExpressionWrapper, F, Q, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from apps.common.qr import qr_svg_response
from apps.users.permissions import IsTeacher
from .models import Lesson, Homework
from .serializers import (
    LessonListSerializer,
    LessonDetailSerializer,
    LessonWriteSerializer,
    LessonShareSerializer,
    HomeworkSerializer,
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


# ── Вход по ссылке ───────────────────────────────────────────────────────────

class LessonShareInfoView(APIView):
    """Публично: карточка урока по токену ссылки."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, share_token):
        lesson = get_object_or_404(Lesson, share_token=share_token)
        return Response(LessonShareSerializer(lesson).data)


class LessonGuestJoinView(APIView):
    """Публично: представился именем — получил гостевой доступ к доске."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, share_token):
        lesson = get_object_or_404(Lesson, share_token=share_token)
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
        lesson = get_object_or_404(Lesson, share_token=share_token)
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
        return self.get_lesson().homework.prefetch_related('completed_by')

    def perform_create(self, serializer):
        lesson = self.get_lesson()
        if lesson.teacher_id != self.request.user.id:
            self.permission_denied(self.request, message='Задание может добавить только преподаватель.')
        serializer.save(lesson=lesson)


class HomeworkDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Правка и удаление задания — преподавателю урока."""
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Homework.objects.select_related('lesson').prefetch_related('completed_by')

    def get_object(self):
        homework = get_object_or_404(self.get_queryset(), pk=self.kwargs['pk'])
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            if homework.lesson.teacher_id != self.request.user.id:
                self.permission_denied(self.request)
        elif not homework.lesson.is_participant(self.request.user):
            self.permission_denied(self.request)
        return homework


class HomeworkDoneView(APIView):
    """Ученик отмечает задание выполненным (и может снять отметку)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        homework = get_object_or_404(Homework.objects.select_related('lesson'), pk=pk)
        if not homework.lesson.is_participant(request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        done = bool(request.data.get('done', True))
        if done:
            homework.completed_by.add(request.user)
        else:
            homework.completed_by.remove(request.user)
        return Response(HomeworkSerializer(homework, context={'request': request}).data)


class MyHomeworkListView(generics.ListAPIView):
    """Домашние задания пользователя — для главной страницы ученика."""
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Homework.objects
            .filter(lesson__in=lessons_for(self.request.user))
            .select_related('lesson')
            .prefetch_related('completed_by', 'lesson__students')
            .distinct()
        )
