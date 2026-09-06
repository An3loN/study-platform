"""
Вход на урок по ссылке: срок её жизни и гостевой доступ.

Ссылку раздают людям без аккаунта, поэтому здесь ошибка стоит дороже обычной:
слишком строгая проверка выставляет за дверь пришедшего вовремя, слишком
мягкая — пускает кого угодно и когда угодно.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.common.models import SiteSettings

pytestmark = pytest.mark.django_db


@pytest.fixture
def ttl_two_days(db):
    settings = SiteSettings.get()
    settings.share_ttl_days = 2
    settings.save()
    return settings


# ── Карточка урока по ссылке ─────────────────────────────────────────────────

def test_share_info_is_public(api, make_lesson, student, ttl_two_days):
    """Без аккаунта — в этом весь смысл ссылки."""
    lesson = make_lesson([student], title='Геометрия')
    response = api.get(f'/api/lessons/share/{lesson.share_token}/')

    assert response.status_code == 200
    assert response.data['title'] == 'Геометрия'


def test_share_info_does_not_leak_private_fields(api, make_lesson, student, ttl_two_days):
    """Гостю ни заметок, ни состава участников."""
    lesson = make_lesson([student], notes='секрет')
    data = api.get(f'/api/lessons/share/{lesson.share_token}/').data

    assert 'notes' not in data
    assert 'students' not in data


def test_unknown_token_is_404(api, ttl_two_days):
    assert api.get('/api/lessons/share/00000000-0000-0000-0000-000000000000/').status_code == 404


# ── Срок жизни ссылки ────────────────────────────────────────────────────────

def test_expired_link_answers_410_not_404(api, make_lesson, student, ttl_two_days):
    """410, а не 404: человек попал по верному адресу, просто поздно."""
    lesson = make_lesson([student], at=timezone.now() - timedelta(days=10))

    response = api.get(f'/api/lessons/share/{lesson.share_token}/')

    assert response.status_code == 410
    assert 'истёк' in response.data['detail']


def test_link_lives_a_while_after_the_lesson(api, make_lesson, student, ttl_two_days):
    """Срок считается от конца занятия, поэтому вчерашний урок ещё открыт."""
    lesson = make_lesson([student], at=timezone.now() - timedelta(days=1))
    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 200


def test_link_to_a_distant_lesson_is_alive(api, make_lesson, student, ttl_two_days):
    """
    Ссылку на урок через месяц выдают заранее. Считай срок от создания —
    она протухла бы задолго до самого занятия.
    """
    lesson = make_lesson([student], at=timezone.now() + timedelta(days=30))
    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 200


def test_moving_the_lesson_moves_the_link_deadline(api, make_lesson, student, ttl_two_days):
    """Поэтому срок и не хранится полем — перенос двигает его вместе с уроком."""
    lesson = make_lesson([student], at=timezone.now() - timedelta(days=10))
    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 410

    lesson.scheduled_at = timezone.now()
    lesson.save()

    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 200


def test_manual_expiry_overrides_the_calculation(api, make_lesson, student, ttl_two_days):
    past = make_lesson([student], at=timezone.now() - timedelta(days=10))
    past.share_expires_at = timezone.now() + timedelta(days=1)
    past.save()

    fresh = make_lesson([student], at=timezone.now())
    fresh.share_expires_at = timezone.now() - timedelta(minutes=1)
    fresh.save()

    assert api.get(f'/api/lessons/share/{past.share_token}/').status_code == 200
    assert api.get(f'/api/lessons/share/{fresh.share_token}/').status_code == 410


def test_zero_ttl_means_forever(api, make_lesson, student):
    settings = SiteSettings.get()
    settings.share_ttl_days = 0
    settings.save()

    lesson = make_lesson([student], at=timezone.now() - timedelta(days=400))
    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 200


# ── Очный урок ───────────────────────────────────────────────────────────────

def test_offline_lesson_has_no_entrance(api, make_lesson, student, ttl_two_days):
    """Ссылка ведёт на доску, а у очного урока её нет — входить некуда."""
    lesson = make_lesson([student], has_whiteboard=False)

    assert api.get(f'/api/lessons/share/{lesson.share_token}/').status_code == 404
    assert api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'Гость'}).status_code == 404


# ── Гостевой вход ────────────────────────────────────────────────────────────

def test_guest_join_returns_a_room_token(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student])
    response = api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'Дядя Вася'})

    assert response.status_code == 200
    assert response.data['room_id'] == str(lesson.room_id)

    token = AccessToken(response.data['access'])
    assert token['guest'] is True
    assert token['room_id'] == str(lesson.room_id)
    assert token['name'] == 'Дядя Вася'


def test_guest_token_lives_twelve_hours(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student])
    response = api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'Гость'})

    token = AccessToken(response.data['access'])
    lifetime = token['exp'] - token['iat']

    assert lifetime == int(timedelta(hours=12).total_seconds())


def test_guest_must_introduce_themselves(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student])
    response = api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': '   '})

    assert response.status_code == 400


def test_long_guest_name_is_trimmed(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student])
    response = api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'я' * 200})

    assert len(AccessToken(response.data['access'])['name']) == 60


def test_finished_lesson_still_lets_a_guest_in(api, make_lesson, student, ttl_two_days):
    """
    Завершённый урок вход не закрывает: статус считается из времени, и
    затянувшееся занятие иначе выставляло бы опоздавшего за дверь. Доступом
    управляет только срок жизни ссылки.
    """
    lesson = make_lesson([student], at=timezone.now() - timedelta(hours=5), duration=60)
    assert lesson.status == 'finished'

    assert api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'Гость'}).status_code == 200


def test_cannot_join_through_an_expired_link(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student], at=timezone.now() - timedelta(days=10))
    assert api.post(f'/api/lessons/share/{lesson.share_token}/join/', {'name': 'Гость'}).status_code == 410


def test_qr_returns_svg(api, make_lesson, student, ttl_two_days):
    lesson = make_lesson([student])
    response = api.get(f'/api/lessons/share/{lesson.share_token}/qr.svg')

    assert response.status_code == 200
    assert 'svg' in response['Content-Type']
