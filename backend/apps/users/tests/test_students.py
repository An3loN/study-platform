"""
Карточка ученика у преподавателя.

Она же принимает пароль: восстановления по SMS нет и не планируется, сбросить
доступ может только преподаватель. Поэтому здесь важно и то, что пароль
работает, и то, что чужую карточку не открыть.
"""
import pytest

from apps.users.models import StudentInvite, User

pytestmark = pytest.mark.django_db


def ids(response):
    return {item['id'] for item in response.data['results']}


# ── Кого видно ───────────────────────────────────────────────────────────────

def test_teacher_sees_only_own_students(as_teacher, student, classmate, stranger):
    assert ids(as_teacher.get('/api/students/')) == {str(student.id), str(classmate.id)}


def test_teacher_cannot_open_someone_elses_student(as_teacher, stranger):
    assert as_teacher.get(f'/api/students/{stranger.id}/').status_code == 404


def test_teacher_cannot_edit_someone_elses_student(as_teacher, stranger):
    response = as_teacher.patch(f'/api/students/{stranger.id}/', {'first_name': 'Взлом'})

    stranger.refresh_from_db()
    assert response.status_code == 404
    assert stranger.first_name == 'Аноним'


def test_student_cannot_list_students(as_student):
    """Список учеников — инструмент преподавателя, ученику там делать нечего."""
    assert as_student.get('/api/students/').status_code == 403


def test_anonymous_gets_401(api, db):
    assert api.get('/api/students/').status_code == 401


# ── Создание ─────────────────────────────────────────────────────────────────

def test_created_student_gets_an_invite(as_teacher, teacher):
    response = as_teacher.post('/api/students/', {'first_name': 'Анна'})

    assert response.status_code == 201
    student = User.objects.get(first_name='Анна')
    assert student.teacher == teacher
    assert student.role == User.ROLE_STUDENT
    assert StudentInvite.objects.filter(student=student).exists()
    assert response.data['invite_url'].endswith(str(response.data['invite_token']))


def test_created_student_has_no_working_password(as_teacher):
    as_teacher.post('/api/students/', {'first_name': 'Анна'})

    student = User.objects.get(first_name='Анна')
    assert not student.has_usable_password()


def test_student_can_be_created_with_nothing_at_all(as_teacher):
    """Поля заполнит сам ученик по ссылке — карточку заводят и пустой."""
    response = as_teacher.post('/api/students/', {})

    assert response.status_code == 201
    assert response.data['display_name']  # хоть что-то показать надо


def test_teacher_can_set_credentials_right_away(as_teacher, api):
    """Ученику без смартфона проще выдать телефон и пароль на месте."""
    response = as_teacher.post('/api/students/', {
        'first_name': 'Анна', 'phone': '+79995550000', 'password': 'freshpass8213',
    })
    assert response.status_code == 201

    assert api.post('/api/auth/login/', {
        'phone': '+79995550000', 'password': 'freshpass8213',
    }).status_code == 200


def test_duplicate_phone_is_rejected(as_teacher, student):
    response = as_teacher.post('/api/students/', {'phone': student.phone})

    assert response.status_code == 400
    assert 'phone' in str(response.data).lower() or 'телефон' in str(response.data).lower()


def test_student_cannot_create_students(as_student):
    assert as_student.post('/api/students/', {'first_name': 'Свой'}).status_code == 403


# ── Настройки со страницы ученика ────────────────────────────────────────────

def test_default_lesson_duration_round_trip(as_teacher, student):
    as_teacher.patch(f'/api/students/{student.id}/', {'default_lesson_duration': 90})

    student.refresh_from_db()
    assert student.default_lesson_duration == 90
    assert as_teacher.get(f'/api/students/{student.id}/').data['default_lesson_duration'] == 90


def test_default_lesson_duration_can_be_cleared(as_teacher, student):
    """Пусто — значит общее значение платформы, а не ноль минут."""
    student.default_lesson_duration = 90
    student.save()

    as_teacher.patch(f'/api/students/{student.id}/', {'default_lesson_duration': None}, format='json')

    student.refresh_from_db()
    assert student.default_lesson_duration is None


def test_teacher_resets_the_password(as_teacher, api, student):
    response = as_teacher.patch(f'/api/students/{student.id}/', {'password': 'brandnew7391'})
    assert response.status_code == 200

    assert api.post('/api/auth/login/', {
        'phone': student.phone, 'password': 'brandnew7391',
    }).status_code == 200
    assert api.post('/api/auth/login/', {
        'phone': student.phone, 'password': 'studentpass1',
    }).status_code == 401


def test_password_is_never_returned(as_teacher, student):
    """Поле write-only: хеш и подавно наружу не уходит."""
    data = as_teacher.patch(f'/api/students/{student.id}/', {'password': 'brandnew7391'}).data

    assert 'password' not in data


def test_weak_password_is_rejected(as_teacher, api, student):
    response = as_teacher.patch(f'/api/students/{student.id}/', {'password': '12345'})

    assert response.status_code == 400
    assert api.post('/api/auth/login/', {
        'phone': student.phone, 'password': 'studentpass1',
    }).status_code == 200  # старый пароль остался рабочим


def test_empty_password_leaves_the_old_one(as_teacher, api, student):
    """Форма шлёт поле всегда; пустое значит «не менять»."""
    as_teacher.patch(f'/api/students/{student.id}/', {'password': '', 'first_name': 'Матвей'})

    assert api.post('/api/auth/login/', {
        'phone': student.phone, 'password': 'studentpass1',
    }).status_code == 200


def test_student_cannot_change_their_own_password_here(as_student, student):
    """Сбрасывает преподаватель — об этом прямо сказано на экране входа."""
    assert as_student.patch(f'/api/students/{student.id}/', {'password': 'ownpass7391'}).status_code == 403


# ── Что отдаётся в карточке ──────────────────────────────────────────────────

def test_registered_flag_and_invite_fields(as_teacher, student):
    """У зарегистрированного приглашения уже нет — показывать нечего."""
    data = next(
        item for item in as_teacher.get('/api/students/').data['results']
        if item['id'] == str(student.id)
    )

    assert data['is_registered'] is True
    assert data['invite_token'] is None
    assert data['invite_expires_at'] is None


def test_pending_student_carries_an_invite(as_teacher):
    as_teacher.post('/api/students/', {'first_name': 'Анна'})
    data = next(
        item for item in as_teacher.get('/api/students/').data['results']
        if item['first_name'] == 'Анна'
    )

    assert data['is_registered'] is False
    assert data['invite_token'] is not None
    assert data['invite_expires_at'] is not None


def test_lessons_count_is_reported(as_teacher, make_lesson, student):
    make_lesson([student])
    make_lesson([student])

    data = next(
        item for item in as_teacher.get('/api/students/').data['results']
        if item['id'] == str(student.id)
    )
    assert data['lessons_count'] == 2


def test_deleting_a_student_removes_the_card(as_teacher, student):
    assert as_teacher.delete(f'/api/students/{student.id}/').status_code == 204
    assert not User.objects.filter(pk=student.pk).exists()
