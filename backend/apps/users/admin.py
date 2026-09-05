from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, StudentInvite


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """
    Наборы полей задаём целиком, а не достраиваем к `UserAdmin.fieldsets`:
    базовые начинаются с `username`, которого у модели нет — логин это телефон.
    """
    list_display = ['display_name', 'phone', 'role', 'teacher', 'is_staff', 'date_joined']
    list_filter = ['role', 'is_staff', 'is_active']
    search_fields = ['phone', 'first_name', 'last_name', 'alias']
    ordering = ['phone']

    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Личные данные', {'fields': ('first_name', 'last_name', 'email')}),
        ('Профиль', {'fields': ('role', 'alias', 'teacher', 'avatar', 'bio',
                                'default_lesson_duration')}),
        ('Права', {'fields': ('is_active', 'is_staff', 'is_superuser',
                              'groups', 'user_permissions')}),
        ('Даты', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('phone', 'password1', 'password2', 'role', 'alias', 'teacher'),
        }),
    )


@admin.register(StudentInvite)
class StudentInviteAdmin(admin.ModelAdmin):
    list_display = ['student', 'token', 'created_at', 'accepted_at', 'expires_at']
    readonly_fields = ['token', 'created_at']
