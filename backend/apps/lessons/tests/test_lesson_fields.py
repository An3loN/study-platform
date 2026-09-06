"""
Что урок отдаёт и кому.

Главное здесь — заметки. Они появились ещё и в списочном сериализаторе (чтобы
страница ученика не добирала каждый урок отдельным запросом), то есть у одного
приватного поля стало две поверхности выдачи. Проверяем обе.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.lessons.models import Lesson

pytestmark = pytest.mark.django_db

NOTE = 'Путается в приведении к общему знаменателю'


def item_in_list(response, lesson):
    return next(item for item in response.data['results'] if item['id'] == str(lesson.id))


# ── Заметки ──────────────────────────────────────────────────────────────────

def test_teacher_sees_notes_in_the_list(as_teacher, make_lesson, student):
    lesson = make_lesson([student], notes=NOTE)
    assert item_in_list(as_teacher.get('/api/lessons/'), lesson)['notes'] == NOTE


def test_teacher_sees_notes_in_detail(as_teacher, make_lesson, student):
    lesson = make_lesson([student], notes=NOTE)
    assert as_teacher.get(f'/api/lessons/{lesson.id}/').data['notes'] == NOTE


def test_student_never_sees_notes_in_the_list(as_student, make_lesson, student):
    """Список — вторая поверхность выдачи заметок, и она тоже закрыта."""
    lesson = make_lesson([student], notes=NOTE)
    assert item_in_list(as_student.get('/api/lessons/'), lesson)['notes'] is None


def test_student_never_sees_notes_in_detail(as_student, make_lesson, student):
    lesson = make_lesson([student], notes=NOTE)
    assert as_student.get(f'/api/lessons/{lesson.id}/').data['notes'] is None


def test_notes_are_not_leaked_anywhere_in_the_payload(as_student, make_lesson, student):
    """Грубая проверка на всякий случай: текста заметки нет в ответе целиком."""
    make_lesson([student], notes=NOTE)
    body = as_student.get('/api/lessons/').content.decode()
    assert NOTE not in body


# ── Ссылка на вход ───────────────────────────────────────────────────────────

def test_share_fields_absent_for_offline_lesson(as_teacher, make_lesson, student):
    """У очного урока доски нет, значит и входить по ссылке некуда."""
    lesson = make_lesson([student], has_whiteboard=False)
    data = as_teacher.get(f'/api/lessons/{lesson.id}/').data

    assert data['share_url'] is None
    assert data['share_token'] is None


def test_share_fields_present_for_online_lesson(as_teacher, make_lesson, student):
    lesson = make_lesson([student], has_whiteboard=True)
    data = as_teacher.get(f'/api/lessons/{lesson.id}/').data

    assert data['share_token'] == str(lesson.share_token)
    assert str(lesson.share_token) in data['share_url']


def test_student_does_not_get_the_share_link(as_student, make_lesson, student):
    """Ссылку раздаёт преподаватель — ученику её выдавать незачем."""
    lesson = make_lesson([student])
    data = as_student.get(f'/api/lessons/{lesson.id}/').data

    assert data['share_url'] is None
    assert data['share_token'] is None


# ── Заметки прошлых занятий ──────────────────────────────────────────────────

def test_previous_notes_take_last_three_non_empty(as_teacher, make_lesson, student):
    """Пустая заметка в списке ничего не говорит, а место занимает."""
    now = timezone.now()
    for days, note in [(10, 'первая'), (8, ''), (6, 'вторая'), (4, 'третья'), (2, 'четвёртая')]:
        make_lesson([student], at=now - timedelta(days=days), notes=note)
    current = make_lesson([student], at=now + timedelta(days=1))

    notes = as_teacher.get(f'/api/lessons/{current.id}/').data['previous_notes']

    assert [item['notes'] for item in notes] == ['четвёртая', 'третья', 'вторая']


def test_previous_notes_only_from_lessons_with_the_same_students(
    as_teacher, make_lesson, student, classmate,
):
    """Заметки по другому ученику здесь только мешали бы."""
    now = timezone.now()
    make_lesson([student], at=now - timedelta(days=3), notes='про Матвея')
    make_lesson([classmate], at=now - timedelta(days=2), notes='про Киру')
    current = make_lesson([student], at=now + timedelta(days=1))

    notes = as_teacher.get(f'/api/lessons/{current.id}/').data['previous_notes']

    assert [item['notes'] for item in notes] == ['про Матвея']


def test_previous_notes_are_empty_for_student(as_student, make_lesson, student):
    now = timezone.now()
    make_lesson([student], at=now - timedelta(days=3), notes='про Матвея')
    current = make_lesson([student], at=now + timedelta(days=1))

    assert as_student.get(f'/api/lessons/{current.id}/').data['previous_notes'] == []


# ── Прочие поля ──────────────────────────────────────────────────────────────

def test_teacher_name_is_in_the_list_for_student(as_student, make_lesson, student, teacher):
    """Ученику важно видеть, с кем занятие."""
    lesson = make_lesson([student])
    assert item_in_list(as_student.get('/api/lessons/'), lesson)['teacher_name'] == teacher.display_name


def test_homework_count_is_reported(as_teacher, make_lesson, make_homework, student):
    lesson = make_lesson([student])
    make_homework(lesson=lesson)
    make_homework(lesson=lesson)

    assert item_in_list(as_teacher.get('/api/lessons/'), lesson)['homework_count'] == 2


# ── Отмена и удаление ────────────────────────────────────────────────────────

def test_teacher_can_cancel_with_a_reason(as_teacher, make_lesson, student, teacher):
    lesson = make_lesson([student])
    response = as_teacher.post(f'/api/lessons/{lesson.id}/cancel/', {'reason': 'заболел'})

    lesson.refresh_from_db()
    assert response.status_code == 200
    assert lesson.status == Lesson.STATUS_CANCELLED
    assert lesson.cancel_reason == 'заболел'
    assert lesson.cancelled_by == teacher


def test_student_can_cancel_too(as_student, make_lesson, student):
    """Отменяет и ученик: он тоже может не прийти."""
    lesson = make_lesson([student])
    response = as_student.post(f'/api/lessons/{lesson.id}/cancel/', {'reason': 'уезжаю'})

    lesson.refresh_from_db()
    assert response.status_code == 200
    assert lesson.cancelled_by == student


def test_cancel_without_a_reason_is_rejected(as_teacher, make_lesson, student):
    """«Урок отменён» без объяснения — худшее, что можно прислать человеку."""
    lesson = make_lesson([student])
    response = as_teacher.post(f'/api/lessons/{lesson.id}/cancel/', {'reason': '   '})

    lesson.refresh_from_db()
    assert response.status_code == 400
    assert lesson.cancelled_at is None


def test_stranger_cannot_cancel(api, make_lesson, student, stranger):
    lesson = make_lesson([student])
    api.force_authenticate(stranger)

    assert api.post(f'/api/lessons/{lesson.id}/cancel/', {'reason': 'просто так'}).status_code == 403
    lesson.refresh_from_db()
    assert lesson.cancelled_at is None


def test_only_teacher_deletes(as_student, as_teacher, make_lesson, student):
    lesson = make_lesson([student])

    assert as_student.delete(f'/api/lessons/{lesson.id}/').status_code == 403
    assert Lesson.objects.filter(pk=lesson.pk).exists()

    assert as_teacher.delete(f'/api/lessons/{lesson.id}/').status_code == 204
    assert not Lesson.objects.filter(pk=lesson.pk).exists()


def test_student_cannot_edit_a_lesson(as_student, make_lesson, student):
    lesson = make_lesson([student])
    response = as_student.patch(f'/api/lessons/{lesson.id}/', {'title': 'своё название'})

    lesson.refresh_from_db()
    assert response.status_code == 403
    assert lesson.title == ''


def test_patch_without_title_keeps_the_old_one(as_teacher, make_lesson, student):
    """
    Тему из формы убрали, и запрос её больше не содержит. Старые уроки со
    своим названием обязаны его сохранить.
    """
    lesson = make_lesson([student], title='Математика · дроби')
    as_teacher.patch(f'/api/lessons/{lesson.id}/', {'duration': 90})

    lesson.refresh_from_db()
    assert lesson.title == 'Математика · дроби'
    assert lesson.duration == 90
