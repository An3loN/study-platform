from django.contrib import admin

from .models import SiteSettings


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    """Единственная строка настроек: добавлять и удалять её нечего."""
    list_display = ['__str__', 'invite_ttl_days', 'share_ttl_days', 'updated_at']
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
