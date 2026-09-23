"""
Защита входа: лимит попыток, одинаковый ответ на любой промах и отзыв
сессий при смене пароля.
"""
from unittest import mock

import pytest
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from apps.users.models import StudentInvite, User

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login/'


def wrong_login(client, phone='+79990000001', **extra):
    return client.post(LOGIN, {'phone': phone, 'password': 'мимо'}, **extra)


# ── Лимит попыток входа ──────────────────────────────────────────────────────

def test_password_guessing_is_cut_off(api, teacher):
    for _ in range(10):
        assert wrong_login(api).status_code == 401

    response = wrong_login(api)

    assert response.status_code == 429
    assert 'Слишком много попыток' in str(response.data['detail'])


def test_after_the_limit_even_the_right_password_waits(api, teacher):
    """Иначе лимит ничего не стоил бы: подбор просто продолжался бы, пока
    ответ не станет 200."""
    for _ in range(10):
        wrong_login(api)

    response = api.post(LOGIN, {'phone': teacher.phone, 'password': 'teacherpass1'})
    assert response.status_code == 429


def test_forged_forwarded_for_does_not_reset_the_limit(api, teacher):
    """
    Начало X-Forwarded-For пишет сам клиент, nginx лишь дописывает в конец
    настоящий адрес. Считать надо по нему, иначе новое выдуманное значение
    на каждый запрос обходило бы лимит.
    """
    for attempt in range(10):
        wrong_login(api, HTTP_X_FORWARDED_FOR=f'10.0.0.{attempt}, 203.0.113.7')

    response = wrong_login(api, HTTP_X_FORWARDED_FOR='10.9.9.9, 203.0.113.7')
    assert response.status_code == 429


def test_limit_is_per_client_address(api, teacher):
    for _ in range(10):
        wrong_login(api, HTTP_X_FORWARDED_FOR='203.0.113.7')

    assert wrong_login(api, HTTP_X_FORWARDED_FOR='203.0.113.8').status_code == 401


@pytest.fixture
def tight_join_limit(monkeypatch):
    """Настоящий лимит на вход по ссылке — 60 в минуту, прогонять его
    целиком незачем."""
    monkeypatch.setattr(ScopedRateThrottle, 'THROTTLE_RATES', {'login': '10/min', 'join': '2/min'})


def test_guest_join_is_limited(api, make_lesson, tight_join_limit):
    lesson = make_lesson()
    url = f'/api/lessons/share/{lesson.share_token}/join/'

    assert api.post(url, {'name': 'Гость'}).status_code == 200
    assert api.post(url, {'name': 'Гость'}).status_code == 200
    assert api.post(url, {'name': 'Гость'}).status_code == 429


def test_invite_accept_is_limited(api, teacher, tight_join_limit):
    invite = StudentInvite.objects.create(student=User.objects.create_user(teacher=teacher))
    url = f'/api/invites/{invite.token}/accept/'

    for _ in range(2):
        api.post(url, {'phone': 'не номер', 'password': ''})
    assert api.post(url, {'phone': 'не номер', 'password': ''}).status_code == 429


# ── Одинаковый ответ на любой промах ─────────────────────────────────────────

def test_unknown_phone_costs_the_same_hashing(api, db):
    """
    Незнакомый номер тоже прогоняет пароль через хешер. Без этого ответ на
    него приходил заметно быстрее, и по времени было видно, есть ли такой
    пользователь.
    """
    with mock.patch.object(User, 'set_password', autospec=True) as hashing:
        response = wrong_login(api, phone='+79995554433')

    assert response.status_code == 401
    hashing.assert_called_once()


def test_inactive_user_gets_the_same_answer(api, teacher):
    teacher.is_active = False
    teacher.save()

    response = api.post(LOGIN, {'phone': teacher.phone, 'password': 'teacherpass1'})

    assert response.status_code == 401
    assert 'Неверный' in str(response.data)


# ── Смена пароля гасит сессии ────────────────────────────────────────────────

def login(client, user, password):
    return client.post(LOGIN, {'phone': user.phone, 'password': password}).data['refresh']


def test_password_reset_by_teacher_ends_old_sessions(api, as_teacher, student):
    """
    Сбрасывает пароль преподаватель, и обычно потому, что доступ ушёл в
    чужие руки. Refresh, выданный до сброса, иначе жил бы ещё неделю.
    """
    stolen = login(api, student, 'studentpass1')

    as_teacher.patch(f'/api/students/{student.id}/', {'password': 'NewStrongPass42'})

    assert api.post('/api/auth/refresh/', {'refresh': stolen}).status_code == 401
    # А с новым паролем вход работает как обычно
    assert api.post(LOGIN, {'phone': student.phone, 'password': 'NewStrongPass42'}).status_code == 200


def test_password_change_anywhere_ends_sessions(api, student):
    """Не только из карточки: админка и shell меняют пароль тем же set_password."""
    stolen = login(api, student, 'studentpass1')

    student.set_password('NewStrongPass42')
    student.save()

    assert api.post('/api/auth/refresh/', {'refresh': stolen}).status_code == 401


def test_other_edits_keep_sessions(api, as_teacher, student):
    session = login(api, student, 'studentpass1')

    as_teacher.patch(f'/api/students/{student.id}/', {'alias': 'Мотя'})

    assert api.post('/api/auth/refresh/', {'refresh': session}).status_code == 200


def test_sessions_of_other_users_survive(api, student, classmate):
    session = login(api, classmate, 'matepass1')

    student.set_password('NewStrongPass42')
    student.save()

    assert not BlacklistedToken.objects.filter(token__user=classmate).exists()
    assert api.post('/api/auth/refresh/', {'refresh': session}).status_code == 200
