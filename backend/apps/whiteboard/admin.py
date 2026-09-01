from django.contrib import admin
from .models import WhiteboardSnapshot, WhiteboardYjsState


@admin.register(WhiteboardSnapshot)
class WhiteboardSnapshotAdmin(admin.ModelAdmin):
    list_display = ['lesson', 'version', 'saved_at']
    list_filter = ['lesson__teacher']
    readonly_fields = ['version', 'saved_at']


@admin.register(WhiteboardYjsState)
class WhiteboardYjsStateAdmin(admin.ModelAdmin):
    list_display = ['lesson', 'updated_at']
    readonly_fields = ['updated_at']
