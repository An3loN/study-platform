from rest_framework import serializers
from apps.users.serializers import UserPublicSerializer
from .models import Course, Enrollment


class CourseListSerializer(serializers.ModelSerializer):
    teacher = UserPublicSerializer(read_only=True)
    students_count = serializers.IntegerField(source='enrollments.count', read_only=True)
    is_enrolled = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'description', 'teacher', 'cover', 'is_published', 'students_count', 'is_enrolled', 'created_at']

    def get_is_enrolled(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(student=request.user).exists()


class CourseDetailSerializer(CourseListSerializer):
    class Meta(CourseListSerializer.Meta):
        fields = CourseListSerializer.Meta.fields


class CourseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['title', 'description', 'cover', 'is_published']

    def create(self, validated_data):
        validated_data['teacher'] = self.context['request'].user
        return super().create(validated_data)


class EnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enrollment
        fields = ['id', 'student', 'course', 'enrolled_at']
        read_only_fields = ['id', 'student', 'enrolled_at']
