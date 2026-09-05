"""
Обсуждение задания — по ветке на ученика, не на задание.

`HomeworkMessage.student` это не автор, а чья ветка: у сообщения ученика
совпадает с автором, у сообщения преподавателя указывает адресата. Разбор
чужой работы одноклассникам видеть незачем.
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.lessons.models import HomeworkMessage

pytestmark = pytest.mark.django_db


@pytest.fixture
def homework(make_lesson, make_homework, student, classmate):
    return make_homework(lesson=make_lesson([student, classmate]))


def texts(response):
    return [message['text'] for message in response.data]


# ── Чья ветка ────────────────────────────────────────────────────────────────

def test_student_message_lands_in_their_own_thread(as_student, homework, student):
    as_student.post(f'/api/homework/{homework.id}/messages/', {'text': 'не понял №14'})

    message = HomeworkMessage.objects.get()
    assert message.author == student
    assert message.student == student  # автор и ветка совпадают


def test_teacher_message_lands_in_the_addressees_thread(as_teacher, homework, teacher, student):
    """У реплики преподавателя `student` — это адресат, а не автор."""
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(student.id), 'text': 'посмотри условие ещё раз',
    })

    message = HomeworkMessage.objects.get()
    assert message.author == teacher
    assert message.student == student


def test_student_cannot_write_into_another_thread(as_student, homework, student, classmate):
    """Параметр от ученика игнорируется — он всегда попадает в свою ветку."""
    as_student.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(classmate.id), 'text': 'подсмотрю',
    })

    assert HomeworkMessage.objects.get().student == student


def test_teacher_must_say_whose_thread(as_teacher, homework):
    """Он говорит с каждым отдельно, и «всем сразу» тут не бывает."""
    response = as_teacher.post(f'/api/homework/{homework.id}/messages/', {'text': 'всем'})

    assert response.status_code == 400
    assert not HomeworkMessage.objects.exists()


def test_teacher_cannot_write_to_someone_not_assigned(as_teacher, homework, stranger):
    response = as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(stranger.id), 'text': 'мимо',
    })

    assert response.status_code == 400
    assert not HomeworkMessage.objects.exists()


# ── Что видно ────────────────────────────────────────────────────────────────

def test_student_sees_only_their_own_thread(as_teacher, as_student, homework, student, classmate):
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(student.id), 'text': 'Матвею',
    })
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(classmate.id), 'text': 'Кире',
    })

    assert texts(as_student.get(f'/api/homework/{homework.id}/messages/')) == ['Матвею']


def test_teacher_switches_threads_by_parameter(as_teacher, homework, student, classmate):
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(student.id), 'text': 'Матвею',
    })
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(classmate.id), 'text': 'Кире',
    })

    mine = as_teacher.get(f'/api/homework/{homework.id}/messages/', {'student': str(student.id)})
    hers = as_teacher.get(f'/api/homework/{homework.id}/messages/', {'student': str(classmate.id)})

    assert texts(mine) == ['Матвею']
    assert texts(hers) == ['Кире']


def test_legacy_message_without_a_thread_is_visible_to_everyone(
    as_student, homework, teacher, student, classmate,
):
    """
    Сообщения до миграции 0008 адресата не имеют, задним числом его не
    восстановить — поэтому они показываются в любой ветке.
    """
    HomeworkMessage.objects.create(homework=homework, author=teacher, student=None, text='старое')
    HomeworkMessage.objects.create(homework=homework, author=teacher, student=classmate, text='Кире')

    assert texts(as_student.get(f'/api/homework/{homework.id}/messages/')) == ['старое']


def test_outsider_cannot_read_a_thread(api, homework, stranger):
    api.force_authenticate(stranger)
    response = api.get(f'/api/homework/{homework.id}/messages/')

    assert response.status_code in (403, 404)


# ── Счётчик сообщений ────────────────────────────────────────────────────────

def test_student_counts_only_their_own_thread(as_teacher, as_student, homework, student, classmate):
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(student.id), 'text': 'Матвею',
    })
    for _ in range(3):
        as_teacher.post(f'/api/homework/{homework.id}/messages/', {
            'student': str(classmate.id), 'text': 'Кире',
        })

    assert as_student.get(f'/api/homework/{homework.id}/').data['messages_count'] == 1


def test_teacher_counts_everything(as_teacher, homework, student, classmate):
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(student.id), 'text': 'Матвею',
    })
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(classmate.id), 'text': 'Кире',
    })

    assert as_teacher.get(f'/api/homework/{homework.id}/').data['messages_count'] == 2


# ── Работа ученика — это файлы из его ветки ──────────────────────────────────

def test_attached_file_becomes_the_submitted_work(as_student, homework, student):
    """Отдельного хранилища для работы нет: сериализатор собирает её из ветки."""
    upload = SimpleUploadedFile('216.jpg', b'\xff\xd8\xff', content_type='image/jpeg')
    as_student.post(f'/api/homework/{homework.id}/messages/', {'text': '', 'attachment': upload})

    row = as_student.get(f'/api/homework/{homework.id}/').data['my_submission']

    assert len(row['files']) == 1
    assert row['files'][0]['name'].endswith('.jpg')


def test_classmates_files_do_not_leak(as_teacher, as_student, homework, student, classmate):
    upload = SimpleUploadedFile('чужое.jpg', b'\xff\xd8\xff', content_type='image/jpeg')
    as_teacher.post(f'/api/homework/{homework.id}/messages/', {
        'student': str(classmate.id), 'text': '', 'attachment': upload,
    })

    row = as_student.get(f'/api/homework/{homework.id}/').data['my_submission']
    assert row['files'] == []


# ── Пустое сообщение ─────────────────────────────────────────────────────────

def test_empty_message_without_a_file_is_rejected(as_student, homework):
    """Отправлять пустоту некуда."""
    response = as_student.post(f'/api/homework/{homework.id}/messages/', {'text': '   '})

    assert response.status_code == 400
    assert not HomeworkMessage.objects.exists()


def test_file_without_text_is_fine(as_student, homework):
    """Прислать работу молча — обычное дело."""
    upload = SimpleUploadedFile('работа.jpg', b'\xff\xd8\xff', content_type='image/jpeg')
    response = as_student.post(f'/api/homework/{homework.id}/messages/', {
        'text': '', 'attachment': upload,
    })

    assert response.status_code == 201
