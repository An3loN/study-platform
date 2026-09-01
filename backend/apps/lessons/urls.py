from django.urls import path

from .views import (
    LessonListCreateView,
    LessonDetailView,
    LessonStartView,
    LessonFinishView,
    LessonShareInfoView,
    LessonGuestJoinView,
    LessonShareQrView,
    HomeworkListCreateView,
    HomeworkDetailView,
    HomeworkDoneView,
    MyHomeworkListView,
)

# /api/lessons/
urlpatterns = [
    path('', LessonListCreateView.as_view(), name='lesson-list'),

    # Вход по ссылке — до <uuid:pk>, иначе share/ уедет в детальный маршрут
    path('share/<uuid:share_token>/', LessonShareInfoView.as_view(), name='lesson-share'),
    path('share/<uuid:share_token>/join/', LessonGuestJoinView.as_view(), name='lesson-share-join'),
    path('share/<uuid:share_token>/qr.svg', LessonShareQrView.as_view(), name='lesson-share-qr'),

    path('<uuid:pk>/', LessonDetailView.as_view(), name='lesson-detail'),
    path('<uuid:pk>/start/', LessonStartView.as_view(), name='lesson-start'),
    path('<uuid:pk>/finish/', LessonFinishView.as_view(), name='lesson-finish'),
    path('<uuid:lesson_pk>/homework/', HomeworkListCreateView.as_view(), name='lesson-homework'),
]

# /api/homework/
homework_urlpatterns = [
    path('', MyHomeworkListView.as_view(), name='homework-list'),
    path('<uuid:pk>/', HomeworkDetailView.as_view(), name='homework-detail'),
    path('<uuid:pk>/done/', HomeworkDoneView.as_view(), name='homework-done'),
]
