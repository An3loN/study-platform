from django.contrib import admin

from .models import Lesson, Homework, HomeworkSubmission, HomeworkMessage


class HomeworkInline(admin.TabularInline):
    model = Homework
    extra = 0
    # У задания к уроку и преподаватель, и адресаты уже определены самим
    # уроком: спрашивать их здесь незачем, а ошибиться — легко
    exclude = ['teacher', 'students']


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'teacher', 'scheduled_at', 'duration', 'status', 'share_valid_until']
    list_filter = ['teacher']
    search_fields = ['title', 'teacher__phone', 'students__phone']
    filter_horizontal = ['students']
    readonly_fields = ['room_id', 'share_token', 'created_at']
    inlines = [HomeworkInline]

    def save_formset(self, request, form, formset, change):
        """Заданию, добавленному на странице урока, преподавателя проставляем
        сами — поле из формы убрано, а без него сохранить нельзя."""
        instances = formset.save(commit=False)
        for instance in instances:
            if isinstance(instance, Homework) and not instance.teacher_id:
                instance.teacher = form.instance.teacher
            instance.save()
        formset.save_m2m()
        for deleted in formset.deleted_objects:
            deleted.delete()


class HomeworkSubmissionInline(admin.TabularInline):
    model = HomeworkSubmission
    extra = 0
    readonly_fields = ['done_at', 'accepted_at', 'revision_requested_at']


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    # lesson в списке — чтобы сразу отличать задания без урока
    list_display = ['__str__', 'teacher', 'lesson', 'due_at', 'created_at']
    list_filter = ['teacher']
    readonly_fields = ['created_at']
    filter_horizontal = ['students']
    inlines = [HomeworkSubmissionInline]


@admin.register(HomeworkMessage)
class HomeworkMessageAdmin(admin.ModelAdmin):
    # student — чья это ветка, а не кто написал: без него в админке не понять,
    # к какой из переписок относится сообщение преподавателя
    list_display = ['homework', 'student', 'author', 'created_at']
    readonly_fields = ['created_at']
