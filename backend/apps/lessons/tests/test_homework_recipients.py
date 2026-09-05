"""
Кому адресовано задание.

Адресаты хранятся двумя разными способами: пока у задания есть урок, они
берутся из урока, и только у задания без урока — из собственного поля
`students`. Что из двух в силе, решает `Homework.student_set`, и все проверки
доступа идут через него, а не через урок напрямую.
"""
import pytest

from apps.lessons.models import Homework

pytestmark = pytest.mark.django_db


def ids(response):
    return {item['id'] for item in response.data['results']}


# ── Задание без урока ────────────────────────────────────────────────────────

def test_homework_without_lesson_requires_students(as_teacher, student):
    """Без урока адресатов взять неоткуда — пустой список это ошибка."""
    response = as_teacher.post('/api/homework/', {'text': 'Повторить признаки подобия'})

    assert response.status_code == 400
    assert 'students' in response.data


def test_homework_without_lesson_accepts_only_own_students(as_teacher, stranger):
    response = as_teacher.post('/api/homework/', {
        'text': 'Чужому ученику', 'students': [str(stranger.id)],
    })

    assert response.status_code == 400
    assert not Homework.objects.exists()


def test_homework_without_lesson_reaches_the_listed_students(
    as_teacher, as_student, student, classmate,
):
    response = as_teacher.post('/api/homework/', {
        'text': 'Между занятиями', 'students': [str(student.id)],
    })
    assert response.status_code == 201

    homework = Homework.objects.get()
    assert homework.lesson is None
    assert set(homework.student_set.all()) == {student}
    assert str(homework.id) in ids(as_student.get('/api/homework/'))


def test_classmate_does_not_see_homework_addressed_to_another(api, as_teacher, student, classmate):
    as_teacher.post('/api/homework/', {'text': 'Только Матвею', 'students': [str(student.id)]})

    api.force_authenticate(classmate)
    assert ids(api.get('/api/homework/')) == set()


def test_student_cannot_create_homework(as_student, student):
    response = as_student.post('/api/homework/', {'text': 'Сам себе', 'students': [str(student.id)]})
    assert response.status_code == 403


# ── Задание к уроку ──────────────────────────────────────────────────────────

def test_lesson_homework_ignores_the_students_list(as_teacher, make_lesson, student, classmate):
    """
    У задания с уроком адресаты берутся из самого урока: присланный список
    в `students` не сохраняется, иначе он разошёлся бы с составом занятия.
    Кира тут не на уроке — и задание её не получает.
    """
    lesson = make_lesson([student])
    response = as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {
        'text': 'К уроку', 'students': [str(classmate.id)],
    })
    assert response.status_code == 201

    homework = Homework.objects.get()
    assert set(homework.student_set.all()) == {student}
    assert list(homework.students.all()) == []


def test_lesson_homework_still_validates_the_ignored_list(as_teacher, make_lesson, student, stranger):
    """
    Список хоть и не сохраняется, но проходит проверку «свой ученик»: чужой
    id — это ошибка в запросе, и молчать о ней хуже, чем ответить 400.
    """
    lesson = make_lesson([student])
    response = as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {
        'text': 'К уроку', 'students': [str(stranger.id)],
    })

    assert response.status_code == 400
    assert not Homework.objects.exists()


def test_student_added_to_the_lesson_later_sees_the_homework(
    as_teacher, as_student, make_lesson, student, classmate,
):
    """
    Ради этого адресаты и не копируются в задание: добавленный на занятие
    ученик перестал бы видеть уже выданную домашку.
    """
    lesson = make_lesson([classmate])
    as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {'text': 'К уроку'})
    homework = Homework.objects.get()

    assert str(homework.id) not in ids(as_student.get('/api/homework/'))

    lesson.students.add(student)

    assert str(homework.id) in ids(as_student.get('/api/homework/'))


def test_student_removed_from_the_lesson_stops_seeing_it(
    as_teacher, as_student, make_lesson, student,
):
    lesson = make_lesson([student])
    as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {'text': 'К уроку'})
    homework = Homework.objects.get()

    lesson.students.remove(student)

    assert str(homework.id) not in ids(as_student.get('/api/homework/'))


def test_teacher_cannot_attach_homework_to_someone_elses_lesson(
    as_teacher, make_lesson, stranger, other_teacher,
):
    lesson = make_lesson([stranger], owner=other_teacher)
    response = as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {'text': 'Не своё'})

    assert response.status_code in (403, 404)
    assert not Homework.objects.exists()


# ── student_set как единственный источник правды ─────────────────────────────

def test_student_set_prefers_the_lesson_over_own_field(make_lesson, make_homework, student, classmate):
    """
    Даже если в `students` что-то лежит, при живом уроке в силе состав урока:
    иначе два источника разошлись бы молча.
    """
    lesson = make_lesson([student])
    homework = make_homework(lesson=lesson, students=[classmate])

    assert set(homework.student_set.all()) == {student}


def test_is_participant_covers_teacher_and_addressees(
    make_lesson, make_homework, teacher, student, classmate, stranger,
):
    lesson = make_lesson([student])
    homework = make_homework(lesson=lesson)

    assert homework.is_participant(teacher)
    assert homework.is_participant(student)
    assert not homework.is_participant(classmate)
    assert not homework.is_participant(stranger)


# ── Доступ к чужому заданию ──────────────────────────────────────────────────

@pytest.fixture
def someone_elses(make_lesson, make_homework, classmate):
    return make_homework(lesson=make_lesson([classmate]))


def test_outsider_cannot_read_someone_elses_homework(as_student, someone_elses):
    assert as_student.get(f'/api/homework/{someone_elses.id}/').status_code in (403, 404)


def test_outsider_cannot_mark_someone_elses_homework_done(as_student, someone_elses):
    response = as_student.post(f'/api/homework/{someone_elses.id}/done/', {'is_done': True})
    assert response.status_code in (403, 404)


def test_outsider_cannot_write_into_someone_elses_thread(as_student, someone_elses):
    response = as_student.post(f'/api/homework/{someone_elses.id}/messages/', {'text': 'привет'})
    assert response.status_code in (403, 404)


def test_teacher_sees_everything_they_set(as_teacher, make_lesson, make_homework, student, classmate):
    to_student = make_homework(lesson=make_lesson([student]))
    to_classmate = make_homework(lesson=make_lesson([classmate]))
    without_lesson = make_homework(students=[student])

    assert ids(as_teacher.get('/api/homework/')) == {
        str(to_student.id), str(to_classmate.id), str(without_lesson.id),
    }


def test_teacher_does_not_see_another_teachers_homework(
    as_teacher, make_lesson, make_homework, stranger, other_teacher,
):
    make_homework(lesson=make_lesson([stranger], owner=other_teacher), owner=other_teacher)
    assert ids(as_teacher.get('/api/homework/')) == set()


def test_group_homework_is_not_duplicated_in_the_list(
    as_teacher, make_lesson, make_homework, student, classmate,
):
    """Join по адресатам без distinct вернул бы групповое задание дважды."""
    make_homework(lesson=make_lesson([student, classmate]))
    response = as_teacher.get('/api/homework/')

    assert response.data['count'] == 1
