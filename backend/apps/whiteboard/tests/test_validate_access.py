"""
Контракт с Hocuspocus: validate-access и yjs-state.

Это единственные endpoint'ы, которые вызывает не браузер, а Node-сервер, и
рассчитывает он на конкретные коды ответа. 404 на пустом состоянии здесь не
ошибка, а часть договорённости — `hocuspocus/src/api.ts` понимает его как
«комната новая».
"""
from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.users.tokens import issue_tokens
from apps.whiteboard.models import WhiteboardYjsState

pytestmark = pytest.mark.django_db

SECRET = {'HTTP_X_HOCUSPOCUS_SECRET': 'test-secret'}


def token_for(user):
    return issue_tokens(user)['access']


def guest_token(lesson, name='Гость'):
    token = AccessToken()
    token.set_exp(lifetime=timedelta(hours=12))
    token['guest'] = True
    token['room_id'] = str(lesson.room_id)
    token['name'] = name
    return str(token)


def validate(api, lesson, token, **extra):
    return api.post(
        '/api/whiteboard/validate-access/',
        {'token': token, 'room_id': str(lesson.room_id)},
        **{**SECRET, **extra},
    )


# ── Общий секрет ─────────────────────────────────────────────────────────────

def test_secret_matches_settings():
    assert settings.HOCUSPOCUS_SECRET == 'test-secret'


# Запрос от Hocuspocus идёт без пользователя, поэтому непрошедшую проверку
# прав DRF отдаёт как 401, а не 403. Hocuspocus смотрит только на «не 200»,
# но код фиксируем: он часть наблюдаемого поведения.
def test_without_secret_rejected(api, make_lesson, student, teacher):
    lesson = make_lesson([student])
    response = api.post('/api/whiteboard/validate-access/', {
        'token': token_for(teacher), 'room_id': str(lesson.room_id),
    })
    assert response.status_code == 401


def test_wrong_secret_rejected(api, make_lesson, student, teacher):
    lesson = make_lesson([student])
    response = validate(api, lesson, token_for(teacher), HTTP_X_HOCUSPOCUS_SECRET='не тот')
    assert response.status_code == 401


# ── Кого пускать ─────────────────────────────────────────────────────────────

def test_teacher_is_let_in(api, make_lesson, student, teacher):
    lesson = make_lesson([student])
    response = validate(api, lesson, token_for(teacher))

    assert response.status_code == 200
    assert response.data['user']['id'] == str(teacher.id)
    assert response.data['user']['role'] == 'teacher'


def test_participant_student_is_let_in(api, make_lesson, student):
    lesson = make_lesson([student])
    response = validate(api, lesson, token_for(student))

    assert response.status_code == 200
    assert response.data['user']['username'] == student.display_name


def test_outsider_is_not_let_in(api, make_lesson, student, classmate):
    lesson = make_lesson([student])
    assert validate(api, lesson, token_for(classmate)).status_code == 403


def test_broken_token_is_forbidden(api, make_lesson, student):
    lesson = make_lesson([student])
    assert validate(api, lesson, 'не-токен-вовсе').status_code == 403


def test_missing_fields_are_a_bad_request(api):
    assert api.post('/api/whiteboard/validate-access/', {}, **SECRET).status_code == 400


def test_unknown_room_is_404(api, make_lesson, student, teacher):
    lesson = make_lesson([student])
    response = api.post('/api/whiteboard/validate-access/', {
        'token': token_for(teacher),
        'room_id': '00000000-0000-0000-0000-000000000000',
    }, **SECRET)
    assert response.status_code == 404


# ── Гость ────────────────────────────────────────────────────────────────────

def test_guest_token_opens_its_own_room(api, make_lesson, student):
    lesson = make_lesson([student])
    response = validate(api, lesson, guest_token(lesson, 'Дядя Вася'))

    assert response.status_code == 200
    assert response.data['user']['role'] == 'guest'
    assert response.data['user']['username'] == 'Дядя Вася'
    assert response.data['user']['id'].startswith('guest:')


def test_guest_token_from_another_lesson_is_rejected(api, make_lesson, student):
    mine = make_lesson([student])
    other = make_lesson([student])

    assert validate(api, mine, guest_token(other)).status_code == 403


def test_offline_lesson_rejects_a_token_issued_earlier(api, make_lesson, student):
    """
    Гостевой токен живёт 12 часов и мог быть выдан до того, как доску
    выключили. Поэтому наличие доски проверяется раньше, чем токену верят.
    """
    lesson = make_lesson([student])
    issued_while_online = guest_token(lesson)

    lesson.has_whiteboard = False
    lesson.save()

    assert validate(api, lesson, issued_while_online).status_code == 403


def test_offline_lesson_rejects_even_the_teacher(api, make_lesson, student, teacher):
    lesson = make_lesson([student], has_whiteboard=False)
    assert validate(api, lesson, token_for(teacher)).status_code == 403


# ── Состояние доски ──────────────────────────────────────────────────────────

def test_empty_state_is_404_by_contract(api, make_lesson, student):
    """Hocuspocus читает этот 404 как «комната новая» — менять код нельзя."""
    lesson = make_lesson([student])
    response = api.get(f'/api/whiteboard/{lesson.room_id}/yjs-state/', **SECRET)

    assert response.status_code == 404


def test_state_round_trip(api, make_lesson, student):
    lesson = make_lesson([student])
    api.put(f'/api/whiteboard/{lesson.room_id}/yjs-state/', {'state': 'AAECAw=='}, **SECRET)

    response = api.get(f'/api/whiteboard/{lesson.room_id}/yjs-state/', **SECRET)

    assert response.status_code == 200
    assert response.data['state'] == 'AAECAw=='


def test_state_is_overwritten_not_duplicated(api, make_lesson, student):
    lesson = make_lesson([student])
    api.put(f'/api/whiteboard/{lesson.room_id}/yjs-state/', {'state': 'AAAA'}, **SECRET)
    api.put(f'/api/whiteboard/{lesson.room_id}/yjs-state/', {'state': 'AQID'}, **SECRET)

    assert api.get(f'/api/whiteboard/{lesson.room_id}/yjs-state/', **SECRET).data['state'] == 'AQID'
    assert WhiteboardYjsState.objects.count() == 1


def test_state_is_stored_as_bytes(api, make_lesson, student):
    """base64 — только на проводе: в базе он занимал бы на треть больше."""
    lesson = make_lesson([student])
    api.put(f'/api/whiteboard/{lesson.room_id}/yjs-state/', {'state': 'AAECAw=='}, **SECRET)

    assert bytes(WhiteboardYjsState.objects.get(lesson=lesson).state) == b'\x00\x01\x02\x03'


def test_state_that_is_not_base64_is_rejected(api, make_lesson, student):
    lesson = make_lesson([student])

    response = api.put(f'/api/whiteboard/{lesson.room_id}/yjs-state/', {'state': 'не base64'}, **SECRET)

    assert response.status_code == 400
    assert not WhiteboardYjsState.objects.exists()


def test_state_needs_the_secret(api, make_lesson, student):
    lesson = make_lesson([student])
    assert api.get(f'/api/whiteboard/{lesson.room_id}/yjs-state/').status_code == 401


def test_snapshot_endpoint_is_gone(api, make_lesson, student, teacher):
    """Прежний способ сохранения доски удалён вместе с моделью."""
    lesson = make_lesson([student])
    api.force_authenticate(teacher)

    assert api.get(f'/api/whiteboard/{lesson.id}/snapshot/').status_code == 404


# ── Смена пароля ─────────────────────────────────────────────────────────────

def test_token_issued_before_password_change_is_refused(api, make_lesson, student):
    """На доску, как и в API, не пускает токен, выданный до смены пароля."""
    lesson = make_lesson([student])
    token = token_for(student)
    student.set_password('NewStrongPass42')
    student.save()

    response = api.post('/api/whiteboard/validate-access/', {'token': token, 'room_id': str(lesson.room_id)}, **SECRET)
    assert response.status_code == 403


def test_token_without_password_stamp_is_refused(api, make_lesson, student):
    """Токен в обход issue_tokens — без отпечатка — не годится."""
    lesson = make_lesson([student])
    token = str(RefreshToken.for_user(student).access_token)

    response = api.post('/api/whiteboard/validate-access/', {'token': token, 'room_id': str(lesson.room_id)}, **SECRET)
    assert response.status_code == 403
