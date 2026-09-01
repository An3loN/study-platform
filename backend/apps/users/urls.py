from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LoginView,
    MeView,
    StudentListCreateView,
    StudentDetailView,
    InviteInfoView,
    InviteAcceptView,
    InviteQrView,
)

# /api/auth/
auth_urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
]

# /api/students/
student_urlpatterns = [
    path('', StudentListCreateView.as_view(), name='student-list'),
    path('<uuid:pk>/', StudentDetailView.as_view(), name='student-detail'),
]

# /api/invites/
invite_urlpatterns = [
    path('<uuid:token>/', InviteInfoView.as_view(), name='invite-info'),
    path('<uuid:token>/accept/', InviteAcceptView.as_view(), name='invite-accept'),
    path('<uuid:token>/qr.svg', InviteQrView.as_view(), name='invite-qr'),
]
