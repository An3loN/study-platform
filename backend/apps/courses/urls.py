from django.urls import path
from .views import CourseListCreateView, CourseDetailView, EnrollView

urlpatterns = [
    path('', CourseListCreateView.as_view(), name='course-list'),
    path('<uuid:pk>/', CourseDetailView.as_view(), name='course-detail'),
    path('<uuid:pk>/enroll/', EnrollView.as_view(), name='course-enroll'),
]
