"""
Статус урока и фильтры ?upcoming / ?past.

Одно правило здесь реализовано дважды: свойством `Lesson.status` в Python и
выражением `ends_at_db` в SQL — свойство модели в запрос не подставить. Такие
пары расходятся первыми, поэтому главный тест в файле сравнивает их между
собой на одном наборе уроков.
"""
from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
import time_machine
from django.utils import timezone

from apps.lessons.models import Lesson

NOON = datetime(2026, 3, 10, 12, 0, tzinfo=dt_timezone.utc)

# tick=False везде намеренно: с идущими часами урок, кончающийся ровно в NOON,
# попадал бы в разные выборки в зависимости от того, сколько миллисекунд прошло
# между двумя запросами, — и тест то падал бы, то нет

pytestmark = pytest.mark.django_db


# ── Само свойство ────────────────────────────────────────────────────────────

@time_machine.travel(NOON, tick=False)
def test_before_start_is_scheduled(make_lesson):
    lesson = make_lesson(at=NOON + timedelta(minutes=1), duration=60)
    assert lesson.status == Lesson.STATUS_SCHEDULED


@time_machine.travel(NOON, tick=False)
def test_exactly_at_start_is_already_active(make_lesson):
    """Момент начала принадлежит уроку: в 12:00 занятие уже идёт."""
    lesson = make_lesson(at=NOON, duration=60)
    assert lesson.status == Lesson.STATUS_ACTIVE


@time_machine.travel(NOON, tick=False)
def test_exactly_at_end_is_already_finished(make_lesson):
    """А момент окончания — уже нет: в 12:00 часовой урок с 11:00 завершён."""
    lesson = make_lesson(at=NOON - timedelta(minutes=60), duration=60)
    assert lesson.status == Lesson.STATUS_FINISHED


@time_machine.travel(NOON, tick=False)
def test_inside_interval_is_active(make_lesson):
    lesson = make_lesson(at=NOON - timedelta(minutes=30), duration=60)
    assert lesson.status == Lesson.STATUS_ACTIVE


@time_machine.travel(NOON, tick=False)
def test_lesson_without_date_is_always_scheduled(make_lesson):
    """Урок без даты ещё предстоит назначить — временем его не завершить."""
    lesson = make_lesson(at=None)
    assert lesson.scheduled_at is None
    assert lesson.status == Lesson.STATUS_SCHEDULED


@time_machine.travel(NOON, tick=False)
def test_lesson_without_duration_counts_as_default(make_lesson):
    """Пустая длительность — час: только чтобы понять, когда урок кончился."""
    assert Lesson.DEFAULT_DURATION_MINUTES == 60
    started_50_min_ago = make_lesson(at=NOON - timedelta(minutes=50), duration=None)
    started_70_min_ago = make_lesson(at=NOON - timedelta(minutes=70), duration=None)

    assert started_50_min_ago.status == Lesson.STATUS_ACTIVE
    assert started_70_min_ago.status == Lesson.STATUS_FINISHED


@time_machine.travel(NOON, tick=False)
def test_cancelled_overrides_time(make_lesson, teacher):
    """Отменённый урок не «идёт» и не «завершается», сколько бы ни прошло."""
    running = make_lesson(at=NOON - timedelta(minutes=10), duration=60)
    long_over = make_lesson(at=NOON - timedelta(days=3), duration=60)
    for lesson in (running, long_over):
        lesson.cancelled_at = timezone.now()
        lesson.cancelled_by = teacher
        lesson.cancel_reason = 'заболел'
        lesson.save()

        assert lesson.status == Lesson.STATUS_CANCELLED


# ── Фильтры, считающие то же самое в SQL ─────────────────────────────────────

@pytest.fixture
def spread_of_lessons(make_lesson, student):
    """
    Уроки вокруг «сейчас», включая безд­атный и без длительности: на них и
    сравниваются две реализации правила.
    """
    return [
        make_lesson([student], at=NOON + timedelta(days=2), duration=45),
        make_lesson([student], at=NOON + timedelta(minutes=1), duration=45),
        make_lesson([student], at=NOON, duration=45),                     # начался только что
        make_lesson([student], at=NOON - timedelta(minutes=44), duration=45),  # ещё идёт
        make_lesson([student], at=NOON - timedelta(minutes=45), duration=45),  # только что кончился
        make_lesson([student], at=NOON - timedelta(minutes=59), duration=None),  # идёт: час по умолчанию
        make_lesson([student], at=NOON - timedelta(minutes=61), duration=None),  # завершён
        make_lesson([student], at=NOON - timedelta(days=5), duration=90),
        make_lesson([student], at=None, duration=45),
    ]


@time_machine.travel(NOON, tick=False)
def test_upcoming_matches_the_property(as_teacher, spread_of_lessons):
    """
    `?upcoming` обязан вернуть ровно те уроки, которые свойство считает
    запланированными или идущими. Разойдутся — значит SQL и Python разъехались.
    """
    response = as_teacher.get('/api/lessons/', {'upcoming': 1})
    returned = {item['id'] for item in response.data['results']}

    expected = {
        str(lesson.id) for lesson in spread_of_lessons
        if lesson.status in (Lesson.STATUS_SCHEDULED, Lesson.STATUS_ACTIVE)
    }
    assert returned == expected


@time_machine.travel(NOON, tick=False)
def test_past_matches_the_property(as_teacher, spread_of_lessons):
    response = as_teacher.get('/api/lessons/', {'past': 1})
    returned = {item['id'] for item in response.data['results']}

    expected = {
        str(lesson.id) for lesson in spread_of_lessons
        if lesson.status == Lesson.STATUS_FINISHED
    }
    assert returned == expected


@time_machine.travel(NOON, tick=False)
def test_upcoming_and_past_split_everything_without_overlap(as_teacher, spread_of_lessons):
    """Каждый урок ровно в одной из двух выборок: ни потерянных, ни задвоенных."""
    upcoming = {item['id'] for item in as_teacher.get('/api/lessons/', {'upcoming': 1}).data['results']}
    past = {item['id'] for item in as_teacher.get('/api/lessons/', {'past': 1}).data['results']}

    assert not (upcoming & past)
    assert upcoming | past == {str(lesson.id) for lesson in spread_of_lessons}


@time_machine.travel(NOON, tick=False)
def test_undated_lesson_is_upcoming(as_teacher, make_lesson, student):
    """Урок без даты предстоит назначить — в прошлое он не уходит."""
    lesson = make_lesson([student], at=None)

    upcoming = {item['id'] for item in as_teacher.get('/api/lessons/', {'upcoming': 1}).data['results']}
    past = {item['id'] for item in as_teacher.get('/api/lessons/', {'past': 1}).data['results']}

    assert str(lesson.id) in upcoming
    assert str(lesson.id) not in past


@time_machine.travel(NOON, tick=False)
def test_cancelled_lesson_stays_in_the_list(as_teacher, make_lesson, student, teacher):
    """
    Отмена перебивает статус, но из выдачи урок не убирает: вторая сторона
    должна увидеть причину. Фильтры по времени его и раскладывают.
    """
    lesson = make_lesson([student], at=NOON - timedelta(days=1), duration=60)
    lesson.cancelled_at = timezone.now()
    lesson.cancelled_by = teacher
    lesson.cancel_reason = 'перенесли'
    lesson.save()

    past = as_teacher.get('/api/lessons/', {'past': 1}).data['results']
    assert str(lesson.id) in {item['id'] for item in past}
    assert next(item for item in past if item['id'] == str(lesson.id))['status'] == 'cancelled'


@time_machine.travel(NOON, tick=False)
def test_lesson_ending_exactly_now_is_past_in_both_implementations(as_teacher, make_lesson, student):
    """
    Граница, на которой SQL и свойство разъезжались: момент окончания уроку
    уже не принадлежит. Раньше `?upcoming` сравнивал нестрого и такой урок
    оказывался сразу в обеих выборках.
    """
    lesson = make_lesson([student], at=NOON - timedelta(minutes=45), duration=45)
    assert lesson.ends_at == NOON
    assert lesson.status == Lesson.STATUS_FINISHED

    upcoming = {item['id'] for item in as_teacher.get('/api/lessons/', {'upcoming': 1}).data['results']}
    past = {item['id'] for item in as_teacher.get('/api/lessons/', {'past': 1}).data['results']}

    assert str(lesson.id) not in upcoming
    assert str(lesson.id) in past
