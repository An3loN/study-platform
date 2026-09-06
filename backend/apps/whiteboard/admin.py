from django.contrib import admin
from .models import WhiteboardYjsState


@admin.register(WhiteboardYjsState)
class WhiteboardYjsStateAdmin(admin.ModelAdmin):
    list_display = ['lesson', 'updated_at']
    readonly_fields = ['updated_at']
