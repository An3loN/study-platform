from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, StudentInvite


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['display_name', 'phone', 'role', 'teacher', 'is_staff', 'date_joined']
    list_filter = ['role', 'is_staff', 'is_active']
    search_fields = ['username', 'phone', 'first_name', 'last_name', 'alias']
    fieldsets = UserAdmin.fieldsets + (
        ('Профиль', {'fields': ('role', 'phone', 'alias', 'teacher', 'avatar', 'bio')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Профиль', {'fields': ('role', 'phone', 'alias', 'teacher')}),
    )


@admin.register(StudentInvite)
class StudentInviteAdmin(admin.ModelAdmin):
    list_display = ['student', 'token', 'created_at', 'accepted_at']
    readonly_fields = ['token', 'created_at']
