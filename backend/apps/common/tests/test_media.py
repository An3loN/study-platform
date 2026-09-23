"""
Загруженные файлы: только по подписанной ссылке и с типом из белого списка.

Раньше `/media/` раздавался всем подряд с того же домена, что и приложение:
работы учеников скачивал любой, кто угадал адрес, а присланный `.html`
открывался как страница сайта и читал токены из `localStorage`.
"""
from datetime import timedelta
from urllib.parse import unquote

import pytest
import time_machine
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.common.media import LINK_TTL

pytestmark = pytest.mark.django_db

JPEG = b'\xff\xd8\xff\xe0 not really a jpeg'


@pytest.fixture
def homework(make_lesson, make_homework, student):
    return make_homework(lesson=make_lesson([student]))


def send_file(client, homework, name, content=JPEG, content_type='image/jpeg'):
    upload = SimpleUploadedFile(name, content, content_type=content_type)
    return client.post(f'/api/homework/{homework.id}/messages/', {'text': '', 'attachment': upload})


def file_url(client, homework):
    """Ссылка на файл так, как её получает фронт."""
    return client.get(f'/api/homework/{homework.id}/').data['my_submission']['files'][0]['url']


def read(response):
    return b''.join(response.streaming_content)


# ── Ссылка ───────────────────────────────────────────────────────────────────

def test_link_is_signed_and_not_under_media(as_student, homework):
    send_file(as_student, homework, 'работа.jpg')

    url = file_url(as_student, homework)

    assert '/api/files/' in url
    assert '/media/' not in url
    # Имя и путь спрятаны в подписи: адрес не угадать по названию работы
    assert 'работа' not in url


def test_file_opens_by_link_without_login(api, as_student, homework):
    """Файл открывают обычной ссылкой — заголовка авторизации у неё нет.
    Доступ даёт сама подпись: ссылку получил только тот, кому файл показали."""
    send_file(as_student, homework, 'работа.jpg')

    response = api.get(file_url(as_student, homework))

    assert response.status_code == 200
    assert read(response) == JPEG
    assert response['Content-Type'] == 'image/jpeg'
    assert response['Content-Disposition'].startswith('inline')
    assert response['X-Content-Type-Options'] == 'nosniff'
    assert 'private' in response['Cache-Control']


def test_forged_signature_is_404(api, as_student, homework):
    send_file(as_student, homework, 'работа.jpg')
    url = file_url(as_student, homework)

    assert api.get(url.rstrip('/')[:-3] + 'AAA/').status_code == 404


def test_link_cannot_be_crafted_for_another_file(api):
    """Без подписи путь к файлу ничего не значит — даже если файл есть."""
    default_storage.save('homework/2026/09/чужое.jpg', ContentFile(JPEG))

    assert api.get('/api/files/homework%2F2026%2F09%2Fчужое.jpg/').status_code == 404


def test_expired_link_is_410_not_404(api, as_student, homework):
    """Ссылка настоящая, просто старая: человеку надо обновить страницу."""
    send_file(as_student, homework, 'работа.jpg')
    url = file_url(as_student, homework)

    with time_machine.travel(timezone.now() + LINK_TTL + timedelta(minutes=1), tick=False):
        response = api.get(url)

    assert response.status_code == 410


def test_deleted_file_is_404(api, as_student, homework):
    send_file(as_student, homework, 'работа.jpg')
    url = file_url(as_student, homework)
    homework.messages.get().attachment.delete()

    assert api.get(url).status_code == 404


def test_old_media_path_is_not_served(api, as_student, homework):
    send_file(as_student, homework, 'работа.jpg')
    name = homework.messages.get().attachment.name

    assert api.get(f'/media/{name}').status_code == 404


# ── Что можно загрузить ──────────────────────────────────────────────────────

@pytest.mark.parametrize('name', ['страница.html', 'картинка.svg', 'скрипт.js', 'page.HTM'])
def test_executable_uploads_are_rejected(as_student, homework, name):
    response = send_file(as_student, homework, name, b'<script>alert(1)</script>', 'text/html')

    assert response.status_code == 400
    assert 'attachment' in response.data
    assert not homework.messages.exists()


@pytest.mark.parametrize('name', ['решение.pdf', 'конспект.docx', 'фото.HEIC', 'учебник.djvu', 'архив.zip'])
def test_ordinary_homework_files_are_accepted(as_student, homework, name):
    assert send_file(as_student, homework, name, b'data', 'application/octet-stream').status_code == 201


def test_homework_attachment_is_checked_too(as_teacher, make_lesson, student):
    lesson = make_lesson([student])
    upload = SimpleUploadedFile('условие.svg', b'<svg/>', content_type='image/svg+xml')

    response = as_teacher.post(f'/api/lessons/{lesson.id}/homework/', {'text': 'x', 'attachment': upload})

    assert response.status_code == 400
    assert 'attachment' in response.data


# ── Как отдаётся ─────────────────────────────────────────────────────────────

def test_unknown_type_is_download_only(api, as_student, homework):
    """Документ не показываем в браузере и не даём угадывать тип по содержимому."""
    send_file(as_student, homework, 'конспект.docx', b'<html><script>1</script>', 'text/html')

    response = api.get(file_url(as_student, homework))

    assert response['Content-Type'] == 'application/octet-stream'
    assert response['Content-Disposition'].startswith('attachment')


def test_html_uploaded_before_the_fix_is_not_rendered(api, as_teacher, homework, student):
    """Файлы, принятые до белого списка, тоже отдаются только на скачивание."""
    message = homework.messages.create(author=student, student=student)
    message.attachment.save('старое.html', ContentFile(b'<script>steal()</script>'))

    url = as_teacher.get(
        f'/api/homework/{homework.id}/messages/', {'student': str(student.id)},
    ).data[0]['attachment']
    response = api.get(url)

    assert response['Content-Type'] == 'application/octet-stream'
    assert response['Content-Disposition'].startswith('attachment')
    assert response['X-Content-Type-Options'] == 'nosniff'


def test_prod_hands_the_file_to_nginx(api, as_student, homework, settings):
    """В проде тело отдаёт nginx: Django только проверяет подпись и
    называет путь, закодированный — nginx разбирает его как URI."""
    settings.MEDIA_ACCEL_REDIRECT_PREFIX = '/protected-media/'
    send_file(as_student, homework, 'моя работа.jpg')
    name = homework.messages.get().attachment.name

    response = api.get(file_url(as_student, homework))

    assert response.status_code == 200
    assert response.content == b''
    redirect = response['X-Accel-Redirect']
    assert redirect.isascii() and ' ' not in redirect
    assert unquote(redirect) == f'/protected-media/{name}'
    assert response['Content-Type'] == 'image/jpeg'
