"""
Приглашение ученика: срок жизни ссылки и регистрация по ней.

Срок приглашения, в отличие от ссылки на урок, стамповится при выдаче и
хранится полем. Разница осмысленная: уменьшение настройки не должно гасить
уже разосланные ссылки.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.models import SiteSettings
from apps.users.models import StudentInvite, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def invite(teacher):
    student = User.objects.create_user(phone=None, teacher=teacher, first_name='Анна')
    return StudentInvite.objects.create(student=student)


# ── Что видно по ссылке ──────────────────────────────────────────────────────

def test_invite_info_is_public(api, invite, teacher):
    response = api.get(f'/api/invites/{invite.token}/')

    assert response.status_code == 200
    assert response.data['first_name'] == 'Анна'
    assert response.data['teacher_name'] == teacher.display_name


def test_unknown_invite_is_404(api):
    assert api.get('/api/invites/00000000-0000-0000-0000-000000000000/').status_code == 404


def test_qr_returns_svg(api, invite):
    response = api.get(f'/api/invites/{invite.token}/qr.svg')

    assert response.status_code == 200
    assert 'svg' in response['Content-Type']


# ── Срок ─────────────────────────────────────────────────────────────────────

def test_expiry_is_stamped_on_issue(db, teacher):
    settings = SiteSettings.get()
    settings.invite_ttl_days = 7
    settings.save()

    student = User.objects.create_user(phone=None, teacher=teacher)
    invite = StudentInvite.objects.create(student=student)

    assert invite.expires_at is not None
    assert abs((invite.expires_at - timezone.now()).days - 6) <= 1


def test_shortening_the_setting_does_not_kill_issued_links(api, db, teacher):
    """
    Ради этого срок и хранится полем: разосланные ссылки должны пережить
    правку настройки.
    """
    settings = SiteSettings.get()
    settings.invite_ttl_days = 30
    settings.save()

    student = User.objects.create_user(phone=None, teacher=teacher)
    invite = StudentInvite.objects.create(student=student)

    settings.invite_ttl_days = 1
    settings.save()

    assert api.get(f'/api/invites/{invite.token}/').status_code == 200


def test_expired_invite_answers_410(api, invite):
    """410, а не 404: ссылка настоящая, но её срок вышел."""
    invite.expires_at = timezone.now() - timedelta(minutes=1)
    invite.save()

    response = api.get(f'/api/invites/{invite.token}/')

    assert response.status_code == 410
    assert 'срок' in response.data['detail'].lower()


def test_cannot_register_through_an_expired_invite(api, invite):
    invite.expires_at = timezone.now() - timedelta(minutes=1)
    invite.save()

    response = api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': '+79995550000', 'password': 'freshpass8213',
    })

    assert response.status_code == 410


def test_empty_expiry_means_forever(api, invite):
    """Очищенное вручную поле — «бессрочно», и заново оно не заполняется."""
    invite.expires_at = None
    invite.save()

    assert api.get(f'/api/invites/{invite.token}/').status_code == 200

    invite.refresh_from_db()
    assert invite.expires_at is None


def test_zero_ttl_issues_an_endless_invite(db, teacher):
    settings = SiteSettings.get()
    settings.invite_ttl_days = 0
    settings.save()

    student = User.objects.create_user(phone=None, teacher=teacher)
    invite = StudentInvite.objects.create(student=student)

    assert invite.expires_at is None


# ── Регистрация ──────────────────────────────────────────────────────────────

def test_accept_sets_credentials_and_returns_tokens(api, invite):
    response = api.post(f'/api/invites/{invite.token}/accept/', {
        'first_name': 'Анна', 'phone': '+7 999 555-00-00', 'password': 'freshpass8213',
    })

    assert response.status_code == 201
    assert set(response.data) == {'access', 'refresh'}

    invite.refresh_from_db()
    invite.student.refresh_from_db()
    assert invite.is_accepted
    assert invite.student.phone == '+79995550000'  # нормализуется при сохранении
    assert invite.student.check_password('freshpass8213')


def test_registered_student_can_log_in(api, invite):
    api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': '+79995550000', 'password': 'freshpass8213',
    })

    response = api.post('/api/auth/login/', {
        'phone': '+79995550000', 'password': 'freshpass8213',
    })
    assert response.status_code == 200


def test_second_registration_is_rejected(api, invite):
    api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': '+79995550000', 'password': 'freshpass8213',
    })
    response = api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': '+79995550001', 'password': 'otherpass8213',
    })

    assert response.status_code in (400, 410)


def test_taken_phone_is_a_clear_error(api, invite, student):
    response = api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': student.phone, 'password': 'freshpass8213',
    })

    assert response.status_code == 400
    assert 'phone' in response.data


def test_weak_password_is_rejected(api, invite):
    response = api.post(f'/api/invites/{invite.token}/accept/', {
        'phone': '+79995550000', 'password': '123',
    })

    assert response.status_code == 400
    invite.refresh_from_db()
    assert not invite.is_accepted


def test_student_without_a_usable_password_cannot_log_in(api, invite):
    """
    До регистрации пароль нерабочий. Даже если телефон уже проставлен —
    например, преподаватель вписал его в карточку, — войти нельзя ничем.
    """
    assert not invite.student.has_usable_password()
    invite.student.phone = '+79995559999'
    invite.student.save()

    response = api.post('/api/auth/login/', {
        'phone': '+79995559999', 'password': 'какой-угодно',
    })
    assert response.status_code == 401
