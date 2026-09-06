"""
Сводка успеваемости ученика.

Она и появилась потому, что на фронте считалась по выдаче списка, а та
пагинирована по 20: цифры молча получались по первой странице и при этом
выглядели достоверно. Поэтому первый же тест здесь — про длинную историю.
"""
from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from apps.lessons.models import HomeworkSubmission

pytestmark = pytest.mark.django_db


@pytest.fixture
def grade(teacher):
    """Проставить оценку прямо в базе: приёмка проверяется в своём файле."""
    def _grade(homework, student, value=None, *, done_at=None, accepted=True):
        return HomeworkSubmission.objects.create(
            homework=homework,
            student=student,
            grade=value,
            is_done=done_at is not None,
            done_at=done_at,
            accepted_at=timezone.now() if accepted else None,
        )
    return _grade


def stats_of(client, student):
    return client.get(f'/api/students/{student.id}/stats/').data


# ── Права ────────────────────────────────────────────────────────────────────

def test_student_cannot_read_stats(as_student, student):
    assert as_student.get(f'/api/students/{student.id}/stats/').status_code == 403


def test_teacher_cannot_read_someone_elses_student(as_teacher, stranger):
    assert as_teacher.get(f'/api/students/{stranger.id}/stats/').status_code == 404


def test_teacher_cannot_ask_about_another_teacher(as_teacher, other_teacher):
    assert as_teacher.get(f'/api/students/{other_teacher.id}/stats/').status_code == 404


def test_anonymous_is_rejected(api, student):
    assert api.get(f'/api/students/{student.id}/stats/').status_code == 401


# ── Главное: вся история, а не одна страница ─────────────────────────────────

def test_counts_the_whole_history_not_one_page(as_teacher, make_homework, make_lesson, student, grade):
    """
    Заданий больше, чем помещается на странице. Если сводка начнёт считаться
    по выдаче списка, разойдётся и число оценок, и средняя.
    """
    page = settings.REST_FRAMEWORK['PAGE_SIZE']
    total = page + 5
    for n in range(total):
        homework = make_homework(lesson=make_lesson([student]), text=f'Задание {n}')
        grade(homework, student, 5 if n < total - 5 else 3)

    listed = as_teacher.get('/api/homework/', {'student': str(student.id)}).data
    stats = stats_of(as_teacher, student)

    assert listed['count'] == total
    assert len(listed['results']) == page  # список отдал только первую страницу
    assert stats['total'] == total  # а сводка посчитала всё
    assert stats['average'] == pytest.approx((5 * (total - 5) + 3 * 5) / total, abs=0.01)


# ── Оценки ───────────────────────────────────────────────────────────────────

def test_average_and_distribution(as_teacher, make_homework, make_lesson, student, grade):
    for value in (5, 5, 4, 3):
        grade(make_homework(lesson=make_lesson([student])), student, value)

    stats = stats_of(as_teacher, student)

    assert stats['average'] == pytest.approx(4.25)
    assert stats['total'] == 4
    assert stats['distribution'] == [
        {'value': 5, 'count': 2},
        {'value': 4, 'count': 1},
        {'value': 3, 'count': 1},
    ]


def test_ungraded_work_is_not_counted(as_teacher, make_homework, make_lesson, student, grade):
    """Принять без балла — нормальный исход, и среднюю он не портит."""
    grade(make_homework(lesson=make_lesson([student])), student, 5)
    grade(make_homework(lesson=make_lesson([student])), student, None)

    stats = stats_of(as_teacher, student)

    assert stats['total'] == 1
    assert stats['average'] == 5.0


def test_empty_history_gives_nulls_not_zeros(as_teacher, student):
    """Ноль и «оценок ещё не было» — разные вещи, и делить на ноль нельзя."""
    stats = stats_of(as_teacher, student)

    assert stats['average'] is None
    assert stats['total'] == 0
    assert stats['distribution'] == []
    assert stats['months'] == []
    assert stats['due_total'] == 0


def test_classmates_grades_do_not_leak_in(as_teacher, make_homework, make_lesson, student, classmate, grade):
    homework = make_homework(lesson=make_lesson([student, classmate]))
    grade(homework, student, 5)
    grade(homework, classmate, 2)

    assert stats_of(as_teacher, student)['average'] == 5.0
    assert stats_of(as_teacher, classmate)['average'] == 2.0


# ── Сдача в срок ─────────────────────────────────────────────────────────────

def test_on_time_late_and_missed(as_teacher, make_homework, make_lesson, student, grade):
    """«В срок» считается по отметке ученика: принято ли — решает преподаватель."""
    now = timezone.now()
    deadline = now - timedelta(days=1)

    grade(make_homework(lesson=make_lesson([student]), due_at=deadline), student,
          done_at=deadline - timedelta(hours=1))
    grade(make_homework(lesson=make_lesson([student]), due_at=deadline), student,
          done_at=deadline + timedelta(hours=1))
    make_homework(lesson=make_lesson([student]), due_at=deadline)  # никто не отмечался

    stats = stats_of(as_teacher, student)

    assert stats['on_time'] == 1
    assert stats['late'] == 1
    assert stats['missed'] == 1
    assert stats['due_total'] == 3


def test_marking_exactly_at_the_deadline_counts_as_on_time(
    as_teacher, make_homework, make_lesson, student, grade,
):
    deadline = timezone.now() - timedelta(days=1)
    grade(make_homework(lesson=make_lesson([student]), due_at=deadline), student, done_at=deadline)

    stats = stats_of(as_teacher, student)

    assert stats['on_time'] == 1
    assert stats['late'] == 0


def test_homework_without_a_deadline_is_out_of_the_count(
    as_teacher, make_homework, make_lesson, student, grade,
):
    """Не сдал к сроку, которого нет, — не провинность."""
    future = make_lesson([student], at=timezone.now() + timedelta(days=1))
    make_homework(lesson=future)  # следующего урока нет — срока тоже

    stats = stats_of(as_teacher, student)

    assert stats['due_total'] == 0
    assert stats['missed'] == 0


# ── По месяцам ───────────────────────────────────────────────────────────────

def test_months_are_the_last_three_by_issue_month(
    as_teacher, make_homework, make_lesson, student, grade,
):
    """Месяц выдачи, а не сдачи: он же стоит на карточке задания."""
    now = timezone.now()
    for months_ago, value in [(4, 2), (3, 3), (2, 4), (1, 5)]:
        homework = make_homework(lesson=make_lesson([student]))
        homework.created_at = now - timedelta(days=30 * months_ago)
        homework.save()
        grade(homework, student, value)

    months = stats_of(as_teacher, student)['months']

    assert len(months) == 3
    assert [month['avg'] for month in months] == [3.0, 4.0, 5.0]
    assert [month['percent'] for month in months] == [60, 80, 100]
    assert all(month['name'] for month in months)


def test_months_average_within_one_month(as_teacher, make_homework, make_lesson, student, grade):
    for value in (4, 5):
        grade(make_homework(lesson=make_lesson([student])), student, value)

    months = stats_of(as_teacher, student)['months']

    assert len(months) == 1
    assert months[0]['avg'] == pytest.approx(4.5)


def test_ungraded_months_do_not_appear(as_teacher, make_homework, make_lesson, student, grade):
    grade(make_homework(lesson=make_lesson([student])), student, None)

    assert stats_of(as_teacher, student)['months'] == []


# ── Задания без урока ────────────────────────────────────────────────────────

def test_homework_without_a_lesson_is_counted_too(as_teacher, make_homework, student, grade):
    grade(make_homework(students=[student]), student, 4)

    stats = stats_of(as_teacher, student)

    assert stats['total'] == 1
    assert stats['average'] == 4.0
