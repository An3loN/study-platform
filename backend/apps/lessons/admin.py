from django.contrib import admin
from .models import Lesson, Homework


class HomeworkInline(admin.TabularInline):
    model = Homework
    extra = 0


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'teacher', 'scheduled_at', 'duration', 'status', 'share_valid_until']
    list_filter = ['teacher']
    search_fields = ['title', 'teacher__username', 'students__username']
    filter_horizontal = ['students']
    readonly_fields = ['room_id', 'share_token', 'created_at']
    inlines = [HomeworkInline]


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'created_at']
    filter_horizontal = ['completed_by']
    readonly_fields = ['created_at']
