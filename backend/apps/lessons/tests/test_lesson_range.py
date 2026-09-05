"""
Промежуток ?from=&to= — то, чем календарь на главной берёт неделю одним
запросом, и ?student=.

Границы здесь важнее всего: календарь считает начало и конец дня по местному
времени пользователя и присылает полный ISO со смещением. Ошибка на границе
уводит урок в соседний день, и заметить это тяжело.
"""
from datetime import datetime, timedelta, timezone as dt_timezone

import pytest

from apps.lessons.models import Lesson

pytestmark = pytest.mark.django_db

DAY = datetime(2026, 3, 10, 0, 0, tzinfo=dt_timezone.utc)


def ids(response):
    return {item['id'] for item in response.data['results']}


def test_from_includes_the_exact_boundary(as_teacher, make_lesson, student):
    """Урок ровно в начале промежутка в него входит."""
    lesson = make_lesson([student], at=DAY)
    response = as_teacher.get('/api/lessons/', {
        'from': DAY.isoformat(),
        'to': (DAY + timedelta(days=1)).isoformat(),
    })
    assert str(lesson.id) in ids(response)


def test_to_excludes_the_exact_boundary(as_teacher, make_lesson, student):
    """
    А ровно в конце — нет: иначе полуночный урок попал бы и в этот день,
    и в следующий, и календарь посчитал бы его дважды.
    """
    end = DAY + timedelta(days=1)
    lesson = make_lesson([student], at=end)
    response = as_teacher.get('/api/lessons/', {'from': DAY.isoformat(), 'to': end.isoformat()})
    assert str(lesson.id) not in ids(response)


def test_adjacent_days_do_not_share_a_lesson(as_teacher, make_lesson, student):
    """Проверка на задвоение: сумма дней равна неделе, пересечений нет."""
    lessons = [make_lesson([student], at=DAY + timedelta(days=n, hours=12)) for n in range(7)]

    seen = []
    for day in range(7):
        start = DAY + timedelta(days=day)
        response = as_teacher.get('/api/lessons/', {
            'from': start.isoformat(),
            'to': (start + timedelta(days=1)).isoformat(),
        })
        seen.append(ids(response))

    assert [len(day) for day in seen] == [1] * 7
    assert set().union(*seen) == {str(lesson.id) for lesson in lessons}


def test_plain_date_is_accepted(as_teacher, make_lesson, student):
    """Голая дата принимается как полночь по времени сервера."""
    inside = make_lesson([student], at=DAY + timedelta(hours=10))
    outside = make_lesson([student], at=DAY - timedelta(hours=1))

    response = as_teacher.get('/api/lessons/', {'from': '2026-03-10', 'to': '2026-03-11'})
    assert ids(response) == {str(inside.id)}
    assert str(outside.id) not in ids(response)


def test_late_evening_lesson_stays_in_its_local_day(as_teacher, make_lesson, student):
    """
    Урок в 23:30 по местному времени должен попасть в свой день, а не в
    соседний. Клиент присылает границы со смещением — здесь +03:00, и в UTC
    урок приходится уже на следующие сутки.
    """
    moscow = dt_timezone(timedelta(hours=3))
    local_evening = datetime(2026, 3, 10, 23, 30, tzinfo=moscow)
    lesson = make_lesson([student], at=local_evening)

    same_day = as_teacher.get('/api/lessons/', {
        'from': datetime(2026, 3, 10, 0, 0, tzinfo=moscow).isoformat(),
        'to': datetime(2026, 3, 11, 0, 0, tzinfo=moscow).isoformat(),
    })
    next_day = as_teacher.get('/api/lessons/', {
        'from': datetime(2026, 3, 11, 0, 0, tzinfo=moscow).isoformat(),
        'to': datetime(2026, 3, 12, 0, 0, tzinfo=moscow).isoformat(),
    })

    assert str(lesson.id) in ids(same_day)
    assert str(lesson.id) not in ids(next_day)


def test_undated_lesson_is_not_in_any_range(as_teacher, make_lesson, student):
    """Урок без даты в промежуток не попадает: его ещё не назначили."""
    lesson = make_lesson([student], at=None)
    response = as_teacher.get('/api/lessons/', {
        'from': DAY.isoformat(),
        'to': (DAY + timedelta(days=365)).isoformat(),
    })
    assert str(lesson.id) not in ids(response)


def test_only_one_bound_is_enough(as_teacher, make_lesson, student):
    early = make_lesson([student], at=DAY - timedelta(days=2))
    late = make_lesson([student], at=DAY + timedelta(days=2))

    only_from = as_teacher.get('/api/lessons/', {'from': DAY.isoformat()})
    only_to = as_teacher.get('/api/lessons/', {'to': DAY.isoformat()})

    assert ids(only_from) == {str(late.id)}
    assert ids(only_to) == {str(early.id)}


def test_garbage_bound_is_ignored_not_fatal(as_teacher, make_lesson, student):
    """Мусор в параметре не роняет список — просто не фильтрует."""
    lesson = make_lesson([student], at=DAY)
    response = as_teacher.get('/api/lessons/', {'from': 'позавчера'})

    assert response.status_code == 200
    assert str(lesson.id) in ids(response)


# ── ?student= ────────────────────────────────────────────────────────────────

def test_student_filter_returns_only_that_student(as_teacher, make_lesson, student, classmate):
    his = make_lesson([student])
    hers = make_lesson([classmate])
    both = make_lesson([student, classmate])

    response = as_teacher.get('/api/lessons/', {'student': str(student.id)})
    returned = ids(response)

    assert returned == {str(his.id), str(both.id)}
    assert str(hers.id) not in returned


def test_group_lesson_is_not_duplicated_by_the_filter(as_teacher, make_lesson, student, classmate):
    """Join по участникам без distinct вернул бы групповой урок дважды."""
    make_lesson([student, classmate])
    response = as_teacher.get('/api/lessons/')

    assert response.data['count'] == 1
    assert len(response.data['results']) == 1


# ── Кто что видит ────────────────────────────────────────────────────────────

def test_teacher_sees_only_own_lessons(as_teacher, make_lesson, student, stranger, other_teacher):
    mine = make_lesson([student])
    make_lesson([stranger], owner=other_teacher)

    assert ids(as_teacher.get('/api/lessons/')) == {str(mine.id)}


def test_student_sees_only_lessons_they_attend(as_student, make_lesson, student, classmate):
    mine = make_lesson([student])
    make_lesson([classmate])

    assert ids(as_student.get('/api/lessons/')) == {str(mine.id)}


def test_stranger_cannot_open_someone_elses_lesson(api, make_lesson, student, stranger):
    """
    403, а не 404: адрес урока — неугадываемый UUID, так что признать его
    существование не страшно, а разные коды на «нет такого» и «не для вас»
    понятнее в отладке.
    """
    lesson = make_lesson([student])
    api.force_authenticate(stranger)

    assert api.get(f'/api/lessons/{lesson.id}/').status_code == 403


def test_anonymous_gets_401(api, make_lesson, student):
    make_lesson([student])
    assert api.get('/api/lessons/').status_code == 401
