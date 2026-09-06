from django.urls import path
from .views import ValidateAccessView, YjsStateView

urlpatterns = [
    path(
        'validate-access/',
        ValidateAccessView.as_view(),
        name='whiteboard-validate-access',
    ),
    path('<uuid:room_id>/yjs-state/', YjsStateView.as_view(), name='whiteboard-yjs-state'),
]
