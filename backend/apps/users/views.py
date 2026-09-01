from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.qr import qr_svg_response
from .models import User, StudentInvite
from .permissions import IsTeacher
from .serializers import (
    LoginSerializer,
    UserProfileSerializer,
    StudentSerializer,
    StudentCreateSerializer,
    InviteInfoSerializer,
    InviteAcceptSerializer,
    issue_tokens,
)


class LoginView(APIView):
    """Вход по телефону и паролю."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class StudentListCreateView(generics.ListCreateAPIView):
    """Список учеников преподавателя и создание нового."""
    permission_classes = [IsTeacher]

    def get_queryset(self):
        return (
            User.objects
            .filter(teacher=self.request.user, role=User.ROLE_STUDENT)
            .annotate(lessons_count=Count('lessons', distinct=True))
            .prefetch_related('invites')
            .order_by('alias', 'first_name', 'last_name')
        )

    def get_serializer_class(self):
        return StudentCreateSerializer if self.request.method == 'POST' else StudentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        student.lessons_count = 0
        return Response(
            StudentSerializer(student, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class StudentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Карточка ученика: правка данных и удаление."""
    permission_classes = [IsTeacher]
    serializer_class = StudentSerializer

    def get_queryset(self):
        return (
            User.objects
            .filter(teacher=self.request.user, role=User.ROLE_STUDENT)
            .annotate(lessons_count=Count('lessons', distinct=True))
            .prefetch_related('invites')
        )


class InviteInfoView(APIView):
    """Публично: что показать ученику, открывшему ссылку-приглашение."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(StudentInvite, token=token)
        return Response(InviteInfoSerializer(invite).data)


class InviteAcceptView(APIView):
    """Публично: ученик заполняет свои данные и получает доступ."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, token):
        invite = get_object_or_404(StudentInvite, token=token)
        if invite.is_accepted:
            return Response(
                {'detail': 'Это приглашение уже использовано.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = InviteAcceptSerializer(data=request.data, context={'invite': invite})
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        return Response(issue_tokens(student), status=status.HTTP_201_CREATED)


class InviteQrView(APIView):
    """
    Публично: QR-код со ссылкой на регистрацию.
    Секрет — сам токен в адресе, поэтому отдельная авторизация не нужна
    (иначе <img> не смог бы отправить заголовок).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(StudentInvite, token=token)
        return qr_svg_response(request.build_absolute_uri(invite.path()))
