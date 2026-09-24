"""
Число запросов на страницу не должно зависеть от числа строк на ней.

Раньше сериализаторы ходили в базу за каждой строкой: приглашения ученика
(трижды), «следующий урок» для срока задания, отменивший урок. Страница из
двадцати заданий стоила шестьдесят с лишним запросов. Здесь сравнивается
страница из двух и из десяти записей — число запросов должно совпасть.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.lessons.models import HomeworkMessage, HomeworkSubmission
from apps.users.models import StudentInvite, User

pytestmark = pytest.mark.django_db


def queries(client, url):
    with CaptureQueriesContext(connection) as ctx:
        response = client.get(url)
    assert response.status_code == 200, response.data
    return len(ctx.captured_queries)


@pytest.fixture
def fill(teacher, student, classmate, make_lesson, make_homework):
    """Добавляет n «строк» всех видов: ученика с приглашением, урок (каждый
    второй отменён), задание к уроку со сдачей и сообщением, задание без урока."""
    def _fill(n):
        lesson = None
        for i in range(n):
            newcomer = User.objects.create_user(teacher=teacher, first_name=f'Новичок {i}')
            StudentInvite.objects.create(student=newcomer)
            lesson = make_lesson([student, classmate, newcomer])
            if i % 2:
                lesson.cancelled_at = timezone.now()
                lesson.cancelled_by = teacher
                lesson.cancel_reason = 'заболел'
                lesson.save()
            homework = make_homework(lesson=lesson)
            make_homework(students=[student])
            HomeworkSubmission.objects.create(homework=homework, student=student, grade=5)
            HomeworkMessage.objects.create(homework=homework, student=student, author=student, text='вопрос')
        return lesson
    return _fill


@pytest.mark.parametrize('client_name, url', [
    ('as_teacher', '/api/students/'),
    ('as_teacher', '/api/lessons/'),
    ('as_student', '/api/lessons/'),
    ('as_teacher', '/api/homework/'),
    ('as_student', '/api/homework/'),
])
def test_list_cost_does_not_grow_with_rows(request, fill, client_name, url):
    client = request.getfixturevalue(client_name)

    fill(2)
    small = queries(client, url)
    fill(8)
    large = queries(client, url)

    assert large == small


def test_lesson_page_cost_does_not_grow_with_homework(as_teacher, fill, make_homework):
    lesson = fill(1)
    small = queries(as_teacher, f'/api/lessons/{lesson.id}/')
    for _ in range(8):
        make_homework(lesson=lesson)

    assert queries(as_teacher, f'/api/lessons/{lesson.id}/') == small
