"""
?open=1 — только незакрытые задания, зато все.

Ленты «требуют внимания» и «к сдаче» раньше фильтровали на фронте первую
страницу выдачи: старая непроверенная работа из них молча пропадала.
Закрыто — значит принято: у ученика — его работа, у преподавателя — у всех.
"""
import pytest
from django.utils import timezone

from apps.lessons.models import HomeworkSubmission

pytestmark = pytest.mark.django_db


def accept(homework, student):
    HomeworkSubmission.objects.update_or_create(
        homework=homework, student=student,
        defaults={'is_done': True, 'accepted_at': timezone.now()},
    )


def open_ids(client):
    response = client.get('/api/homework/', {'open': 1, 'page_size': 100})
    assert response.status_code == 200
    return {row['id'] for row in response.data['results']}


@pytest.fixture
def group(make_lesson, make_homework, student, classmate):
    return make_homework(lesson=make_lesson([student, classmate]))


# ── Преподаватель ────────────────────────────────────────────────────────────

def test_teacher_sees_homework_until_everyone_is_accepted(as_teacher, group, student, classmate):
    assert open_ids(as_teacher) == {str(group.id)}

    accept(group, student)
    assert open_ids(as_teacher) == {str(group.id)}  # одноклассницу ещё не приняли

    accept(group, classmate)
    assert open_ids(as_teacher) == set()


def test_submitted_but_not_accepted_is_still_open(as_teacher, group, student, classmate):
    """Прислано — не значит проверено: как раз такое и требует внимания."""
    for who in (student, classmate):
        HomeworkSubmission.objects.create(homework=group, student=who, is_done=True)

    assert open_ids(as_teacher) == {str(group.id)}


def test_homework_without_lesson_uses_its_own_recipients(as_teacher, make_homework, student):
    homework = make_homework(students=[student])
    assert open_ids(as_teacher) == {str(homework.id)}

    accept(homework, student)
    assert open_ids(as_teacher) == set()


def test_old_open_homework_is_not_cut_by_the_page(as_teacher, make_homework, make_lesson, student):
    """Двадцать свежих принятых заданий не вытесняют старое непроверенное."""
    old = make_homework(students=[student])
    for _ in range(25):
        accept(make_homework(lesson=make_lesson([student])), student)

    assert open_ids(as_teacher) == {str(old.id)}


def test_without_the_flag_everything_is_listed(as_teacher, group, student, classmate):
    accept(group, student)
    accept(group, classmate)

    assert as_teacher.get('/api/homework/').data['count'] == 1


# ── Ученик ───────────────────────────────────────────────────────────────────

def test_student_cares_only_about_their_own_work(as_student, group, student, classmate):
    accept(group, classmate)
    assert open_ids(as_student) == {str(group.id)}

    accept(group, student)
    assert open_ids(as_student) == set()


def test_revision_keeps_it_open_for_the_student(as_student, group, student):
    HomeworkSubmission.objects.create(homework=group, student=student, revision_requested_at=timezone.now())

    assert open_ids(as_student) == {str(group.id)}
