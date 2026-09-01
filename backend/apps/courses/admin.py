from django.contrib import admin
from .models import Course, Enrollment


class EnrollmentInline(admin.TabularInline):
    model = Enrollment
    extra = 0
    readonly_fields = ['enrolled_at']


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['title', 'teacher', 'is_published', 'created_at']
    list_filter = ['is_published']
    search_fields = ['title', 'teacher__username']
    inlines = [EnrollmentInline]


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'course', 'enrolled_at']
    list_filter = ['course']
