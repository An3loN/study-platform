from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from apps.users.urls import auth_urlpatterns, student_urlpatterns, invite_urlpatterns
from apps.lessons.urls import urlpatterns as lesson_urls, homework_urlpatterns

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include(auth_urlpatterns)),
    path('api/students/', include(student_urlpatterns)),
    path('api/invites/', include(invite_urlpatterns)),
    path('api/lessons/', include(lesson_urls)),
    path('api/homework/', include(homework_urlpatterns)),
    path('api/whiteboard/', include('apps.whiteboard.urls')),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path('__debug__/', include(debug_toolbar.urls))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
