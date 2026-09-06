"""
Сроки домашних заданий.

Правило «до следующего урока» посчитано в проекте дважды: `next_lesson_at`
в сериализаторе делает это запросом на задание, а сводка успеваемости —
двоичным поиском по разом загруженным временам уроков, иначе на всей истории
получался бы N+1. Последний тест файла держит их вместе: пока это две
реализации, они обязаны отвечать одинаково.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db


def due_of(client, homework):
    """
    `effective_due_at` — SerializerMethodField, и до рендера в `.data` лежит
    сам datetime, а не строка. Сравнивать удобнее именно с ним.
    """
    return client.get(f'/api/homework/{homework.id}/').data['effective_due_at']


def test_manual_due_date_wins(as_teacher, make_homework, make_lesson, student):
    """Заданный руками срок не пересчитывается по урокам."""
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    make_lesson([student], at=now + timedelta(days=2))
    deadline = now + timedelta(days=5)
    homework = make_homework(lesson=lesson, due_at=deadline)

    assert due_of(as_teacher, homework) == deadline


def test_empty_due_falls_to_the_next_lesson(as_teacher, make_homework, make_lesson, student):
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    following = make_lesson([student], at=now + timedelta(days=3))
    make_lesson([student], at=now + timedelta(days=9))  # через один — не он
    homework = make_homework(lesson=lesson)

    assert due_of(as_teacher, homework) == following.scheduled_at


def test_moving_the_next_lesson_moves_the_deadline(as_teacher, make_homework, make_lesson, student):
    """Ради этого срок и не хранится полем: перенос занятия двигает его сам."""
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    following = make_lesson([student], at=now + timedelta(days=3))
    homework = make_homework(lesson=lesson)

    following.scheduled_at = now + timedelta(days=4)
    following.save()

    assert due_of(as_teacher, homework) == following.scheduled_at


def test_no_next_lesson_means_no_deadline(as_teacher, make_homework, make_lesson, student):
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    homework = make_homework(lesson=lesson)

    assert due_of(as_teacher, homework) is None


def test_lessons_before_the_current_one_do_not_count(as_teacher, make_homework, make_lesson, student):
    """«Следующий» считается от урока, на котором задано, а не от сегодня."""
    now = timezone.now()
    make_lesson([student], at=now - timedelta(days=5))
    lesson = make_lesson([student], at=now - timedelta(days=1))
    following = make_lesson([student], at=now + timedelta(days=2))
    homework = make_homework(lesson=lesson)

    assert due_of(as_teacher, homework) == following.scheduled_at


def test_homework_without_lesson_counts_from_when_it_was_set(
    as_teacher, make_homework, make_lesson, student,
):
    """У задания без урока «до следующего занятия» отсчитывается от выдачи."""
    now = timezone.now()
    make_lesson([student], at=now - timedelta(days=1))
    following = make_lesson([student], at=now + timedelta(days=2))
    homework = make_homework(students=[student])

    assert due_of(as_teacher, homework) == following.scheduled_at


def test_someone_elses_lesson_is_not_a_deadline(as_teacher, make_homework, make_lesson, student, classmate):
    """Срок Матвея не может упираться в занятие, на которое он не ходит."""
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    make_lesson([classmate], at=now + timedelta(days=2))
    his_own = make_lesson([student], at=now + timedelta(days=4))
    homework = make_homework(lesson=lesson)

    assert due_of(as_teacher, homework) == his_own.scheduled_at


def test_student_sees_deadline_by_their_own_lessons(
    as_student, make_homework, make_lesson, student, classmate,
):
    """
    Ученику срок считается по его собственным урокам: у группового задания
    у каждого он может быть свой.
    """
    now = timezone.now()
    lesson = make_lesson([student, classmate], at=now + timedelta(days=1))
    make_lesson([classmate], at=now + timedelta(days=2))
    his = make_lesson([student], at=now + timedelta(days=5))
    homework = make_homework(lesson=lesson)

    assert due_of(as_student, homework) == his.scheduled_at


def test_undated_lessons_are_not_deadlines(as_teacher, make_homework, make_lesson, student):
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    make_lesson([student], at=None)
    following = make_lesson([student], at=now + timedelta(days=6))
    homework = make_homework(lesson=lesson)

    assert due_of(as_teacher, homework) == following.scheduled_at


# ── Два расчёта одного правила ───────────────────────────────────────────────

def test_stats_and_serializer_agree_on_deadlines(as_teacher, make_homework, make_lesson, student):
    """
    Сводка успеваемости считает срок своим способом. Складываем историю, где
    встречается всё сразу — ручной срок, расчётный, задание без урока и
    задание, у которого следующего урока нет, — и сверяем: сколько заданий
    сериализатор считает имеющими срок, столько же должно попасть в
    `due_total` сводки.
    """
    now = timezone.now()
    lessons = [make_lesson([student], at=now - timedelta(days=n)) for n in (30, 20, 10, 4)]
    future = make_lesson([student], at=now + timedelta(days=3))

    make_homework(lesson=lessons[0])                                   # срок — следующий урок
    make_homework(lesson=lessons[1], due_at=now - timedelta(days=15))  # ручной срок
    make_homework(lesson=lessons[2])
    make_homework(lesson=lessons[3])                                   # упрётся в future
    make_homework(lesson=future)                                       # следующего урока нет
    make_homework(students=[student])                                  # без урока: от выдачи

    listed = as_teacher.get('/api/homework/', {'student': str(student.id)}).data['results']
    with_deadline = [item for item in listed if item['effective_due_at'] is not None]

    stats = as_teacher.get(f'/api/students/{student.id}/stats/').data

    assert len(listed) == 6
    assert stats['due_total'] == len(with_deadline)


def test_stats_and_serializer_agree_when_nothing_has_a_deadline(
    as_teacher, make_homework, make_lesson, student,
):
    now = timezone.now()
    lesson = make_lesson([student], at=now + timedelta(days=1))
    make_homework(lesson=lesson)

    listed = as_teacher.get('/api/homework/', {'student': str(student.id)}).data['results']
    stats = as_teacher.get(f'/api/students/{student.id}/stats/').data

    assert [item['effective_due_at'] for item in listed] == [None]
    assert stats['due_total'] == 0
