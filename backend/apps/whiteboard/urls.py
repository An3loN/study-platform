from django.urls import path
from .views import WhiteboardSnapshotView, ValidateAccessView, YjsStateView

urlpatterns = [
    path(
        'validate-access/',
        ValidateAccessView.as_view(),
        name='whiteboard-validate-access',
    ),
    path('<uuid:lesson_pk>/snapshot/', WhiteboardSnapshotView.as_view(), name='whiteboard-snapshot'),
    path('<uuid:room_id>/yjs-state/', YjsStateView.as_view(), name='whiteboard-yjs-state'),
]
