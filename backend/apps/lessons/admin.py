from django.contrib import admin

from .models import Lesson, Homework, HomeworkSubmission, HomeworkMessage


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


class HomeworkSubmissionInline(admin.TabularInline):
    model = HomeworkSubmission
    extra = 0
    readonly_fields = ['done_at', 'accepted_at', 'revision_requested_at']


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'due_at', 'created_at']
    readonly_fields = ['created_at']
    inlines = [HomeworkSubmissionInline]


@admin.register(HomeworkMessage)
class HomeworkMessageAdmin(admin.ModelAdmin):
    # student — чья это ветка, а не кто написал: без него в админке не понять,
    # к какой из переписок относится сообщение преподавателя
    list_display = ['homework', 'student', 'author', 'created_at']
    readonly_fields = ['created_at']
