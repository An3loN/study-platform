from rest_framework import generics, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.permissions import IsTeacher
from .models import Course, Enrollment
from .serializers import CourseListSerializer, CourseDetailSerializer, CourseWriteSerializer


class CourseListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            return Course.objects.filter(teacher=user).select_related('teacher')
        return Course.objects.filter(is_published=True).select_related('teacher')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CourseWriteSerializer
        return CourseListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsTeacher()]
        return super().get_permissions()


class CourseDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Course.objects.select_related('teacher')
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return CourseWriteSerializer
        return CourseDetailSerializer

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            return [IsTeacher()]
        return super().get_permissions()

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method in ('PUT', 'PATCH', 'DELETE') and obj.teacher != request.user:
            self.permission_denied(request)


class EnrollView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        course = generics.get_object_or_404(Course, pk=pk, is_published=True)
        if request.user.is_teacher:
            return Response({'detail': 'Преподаватели не могут записываться на курсы.'}, status=status.HTTP_400_BAD_REQUEST)
        _, created = Enrollment.objects.get_or_create(student=request.user, course=course)
        if not created:
            return Response({'detail': 'Вы уже записаны на этот курс.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        course = generics.get_object_or_404(Course, pk=pk)
        Enrollment.objects.filter(student=request.user, course=course).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
