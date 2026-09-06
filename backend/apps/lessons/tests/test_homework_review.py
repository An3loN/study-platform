"""
Сдача и приёмка.

Отметка ученика и приёмка преподавателя — разные поля: «я сделал» не то же
самое, что «принято». Оценка при этом необязательна — принять без балла
нормальный исход, и путать «нет оценки» с «не принято» нельзя.
"""
import pytest

from apps.lessons.models import HomeworkSubmission

pytestmark = pytest.mark.django_db


@pytest.fixture
def homework(make_lesson, make_homework, student, classmate):
    return make_homework(lesson=make_lesson([student, classmate]))


def submission_of(homework, user):
    return HomeworkSubmission.objects.get(homework=homework, student=user)


def my_row(client, homework):
    return client.get(f'/api/homework/{homework.id}/').data['my_submission']


# ── Отметка ученика ──────────────────────────────────────────────────────────

def test_marking_done_creates_a_submission(as_student, homework, student):
    response = as_student.post(f'/api/homework/{homework.id}/done/', {'done': True})

    assert response.status_code == 200
    row = submission_of(homework, student)
    assert row.is_done
    assert row.done_at is not None
    assert row.accepted_at is None  # отметка — заявка на проверку, не приёмка


def test_status_after_marking_is_submitted(as_student, homework):
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': True})
    assert my_row(as_student, homework)['status'] == 'submitted'


def test_student_can_take_the_mark_back(as_student, homework, student):
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': True})
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': False})

    row = submission_of(homework, student)
    assert not row.is_done
    assert row.done_at is None


def test_unmarking_cancels_an_earlier_acceptance(as_teacher, as_student, homework, student):
    """Снял отметку сам — приёмка больше не актуальна."""
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True, 'grade': 5,
    })
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': False})

    assert submission_of(homework, student).accepted_at is None


def test_teacher_marking_done_does_not_show_up_as_a_submission(as_teacher, homework, teacher):
    """
    В интерфейсе отметки у преподавателя нет, но endpoint её принимает.
    Важно, что в выдачу такая строка не попадает: `submissions` строится по
    адресатам задания, а преподаватель в них не входит.
    """
    as_teacher.post(f'/api/homework/{homework.id}/done/', {'done': True})

    rows = as_teacher.get(f'/api/homework/{homework.id}/').data['submissions']
    assert str(teacher.id) not in {row['student']['id'] for row in rows}


# ── Приёмка ──────────────────────────────────────────────────────────────────

def test_accepting_with_a_grade(as_teacher, homework, student):
    response = as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True, 'grade': 4,
    })

    assert response.status_code == 200
    row = submission_of(homework, student)
    assert row.accepted_at is not None
    assert row.grade == 4
    assert row.is_done  # принято — значит сделано, даже если ученик забыл отметить


def test_accepting_without_a_grade_is_normal(as_teacher, homework, student):
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True,
    })

    row = submission_of(homework, student)
    assert row.accepted_at is not None
    assert row.grade is None


def test_accepted_status_is_reported(as_teacher, as_student, homework, student):
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True,
    })
    assert my_row(as_student, homework)['status'] == 'accepted'


def test_revision_clears_the_students_mark(as_teacher, as_student, homework, student):
    """Ученик проставит отметку заново, когда исправит."""
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': True})
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': False,
    })

    row = submission_of(homework, student)
    assert not row.is_done
    assert row.revision_requested_at is not None
    assert row.accepted_at is None
    assert my_row(as_student, homework)['status'] == 'revision'


def test_marking_done_again_lifts_the_revision(as_teacher, as_student, homework, student):
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': False,
    })
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': True})

    row = submission_of(homework, student)
    assert row.revision_requested_at is None
    assert row.is_done


@pytest.mark.parametrize('bad', [0, 6, -1, 100])
def test_grade_outside_the_scale_is_rejected(as_teacher, homework, student, bad):
    response = as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True, 'grade': bad,
    })

    assert response.status_code == 400
    assert not HomeworkSubmission.objects.filter(homework=homework, student=student).exists()


def test_non_numeric_grade_is_rejected(as_teacher, homework, student):
    response = as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True, 'grade': 'отлично',
    })
    assert response.status_code == 400


def test_review_needs_a_student(as_teacher, homework):
    assert as_teacher.post(f'/api/homework/{homework.id}/review/', {'accepted': True}).status_code == 400


def test_cannot_review_someone_who_was_not_assigned(as_teacher, homework, stranger):
    response = as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(stranger.id), 'accepted': True,
    })
    assert response.status_code == 400


def test_student_cannot_accept_their_own_work(as_student, homework, student):
    response = as_student.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': True, 'grade': 5,
    })

    assert response.status_code in (403, 404)
    assert not HomeworkSubmission.objects.filter(
        homework=homework, student=student, accepted_at__isnull=False,
    ).exists()


# ── Что видно в выдаче ───────────────────────────────────────────────────────

def test_teacher_sees_a_row_for_everyone_including_silent(as_teacher, homework, student, classmate):
    """«Не сдал» — тоже состояние, и показать его надо."""
    rows = as_teacher.get(f'/api/homework/{homework.id}/').data['submissions']

    assert {row['student']['id'] for row in rows} == {str(student.id), str(classmate.id)}
    assert all(row['status'] == 'pending' for row in rows)
    assert not HomeworkSubmission.objects.exists()  # строки достроены, а не созданы


def test_student_sees_only_their_own_row(as_student, as_teacher, homework, student, classmate):
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(classmate.id), 'accepted': True, 'grade': 5,
    })

    rows = as_student.get(f'/api/homework/{homework.id}/').data['submissions']

    assert [row['student']['id'] for row in rows] == [str(student.id)]


def test_classmates_grade_is_not_in_the_payload(as_student, as_teacher, homework, classmate):
    """Чужая оценка не должна доезжать до браузера даже неотрисованной."""
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(classmate.id), 'accepted': True, 'grade': 3,
    })

    body = as_student.get(f'/api/homework/{homework.id}/').content.decode()

    assert str(classmate.id) not in body


# ── Булевы значения из формы ─────────────────────────────────────────────────

def test_unmarking_works_over_form_encoding(as_student, homework, student):
    """`bool('false')` это `True` — разбирать значение приходится вручную."""
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': 'true'})
    as_student.post(f'/api/homework/{homework.id}/done/', {'done': 'false'})

    assert not submission_of(homework, student).is_done


def test_revision_over_form_encoding_does_not_accept_the_work(as_teacher, homework, student):
    """Худший исход этой ошибки: «на поправки» принимало работу."""
    as_teacher.post(f'/api/homework/{homework.id}/review/', {
        'student': str(student.id), 'accepted': 'false',
    })

    row = submission_of(homework, student)
    assert row.accepted_at is None
    assert row.revision_requested_at is not None
