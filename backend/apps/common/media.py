"""
Загруженные файлы — только по подписанной ссылке.

Раньше nginx отдавал `/media/` всем подряд, с того же домена, что и само
приложение, и с тем типом, который подсказывало расширение. Отсюда две беды.
Любой, кто знал адрес, скачивал работы учеников, а угадать его было легко:
`homework/messages/<год>/<месяц>/<исходное имя>`. А присланный `.html` или
`.svg` открывался как страница сайта: скрипт внутри читал токены из
`localStorage` и уносил аккаунт того, кто кликнул, — обычно преподавателя.

Теперь `storage.url()` выдаёт ссылку на Django с подписью и сроком. Проверять
права при скачивании не нужно: ссылку получает только тот, кому сериализатор
показал файл, а он уже всё проверил. Заголовок авторизации тут не годится —
файл открывают обычной ссылкой, и `<a href>` его не пошлёт.

Отдаёт файл в проде nginx (`X-Accel-Redirect` во внутренний location), в
разработке и тестах — сам Django. Тип выбирает сервер по белому списку:
картинки, PDF, звук и видео открываются в браузере, всё остальное только
скачивается и никогда не исполняется.
"""
from datetime import timedelta
from pathlib import PurePosixPath
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.validators import FileExtensionValidator
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse
from django.utils.http import content_disposition_header
from django.views.decorators.http import require_GET

SIGNING_SALT = 'apps.common.media'

# Сколько живёт ссылка. Её выдаёт каждый ответ API, так что открытая страница
# получает свежую при любом обновлении данных; сутки — запас на вкладку,
# которую не трогали весь день.
LINK_TTL = timedelta(hours=24)

# Что можно открыть прямо в браузере. Здесь нет ничего, что браузер исполнит:
# ни HTML, ни SVG (внутри SVG бывает скрипт), ни XML
INLINE_TYPES = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'pdf': 'application/pdf',
    'txt': 'text/plain; charset=utf-8',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
}

# Что вообще можно загрузить: сверх показываемого — документы, архивы,
# фото с айфона, книги в DjVu, чертежи GeoGebra. Раздача и так безопасна
# для любого типа, список — второй рубеж против того, что можно исполнить
ALLOWED_EXTENSIONS = sorted({
    *INLINE_TYPES,
    'heic', 'heif', 'mov',
    'doc', 'docx', 'odt', 'rtf',
    'xls', 'xlsx', 'ods', 'csv',
    'ppt', 'pptx', 'odp',
    'djvu', 'tex', 'ggb',
    'zip', 'rar', '7z',
})

validate_upload_extension = FileExtensionValidator(
    allowed_extensions=ALLOWED_EXTENSIONS,
    message='Файлы «%(extension)s» не принимаются. Подойдут картинки, PDF, документы и архивы.',
)


def sign_name(name):
    return signing.dumps(name, salt=SIGNING_SALT)


class ProtectedMediaStorage(FileSystemStorage):
    """Файлы лежат там же, где и лежали, меняется только адрес раздачи."""

    def url(self, name):
        return reverse('media-file', kwargs={'token': sign_name(name)})


def file_type(name):
    """(Content-Type, открывать ли в браузере) по расширению из белого списка."""
    extension = PurePosixPath(name).suffix.lower().lstrip('.')
    content_type = INLINE_TYPES.get(extension)
    if content_type:
        return content_type, True
    # Остальное только скачивается: браузер не должен ни показывать его, ни
    # угадывать тип по содержимому
    return 'application/octet-stream', False


@require_GET
def media_file(request, token):
    try:
        name = signing.loads(token, salt=SIGNING_SALT, max_age=LINK_TTL)
    except signing.SignatureExpired:
        return HttpResponse(
            'Ссылка на файл устарела. Обновите страницу, с которой вы её открыли.',
            status=410,
            content_type='text/plain; charset=utf-8',
        )
    except signing.BadSignature:
        raise Http404

    if not default_storage.exists(name):
        raise Http404

    content_type, inline = file_type(name)
    prefix = settings.MEDIA_ACCEL_REDIRECT_PREFIX
    if prefix:
        response = HttpResponse(content_type=content_type)
        # nginx разбирает путь как URI, поэтому кириллицу и пробелы в имени
        # кодируем — иначе ему не найти файл
        response['X-Accel-Redirect'] = quote(f'{prefix}{name}')
    else:
        response = FileResponse(default_storage.open(name, 'rb'), content_type=content_type)

    response['Content-Disposition'] = content_disposition_header(
        not inline, PurePosixPath(name).name,
    )
    response['X-Content-Type-Options'] = 'nosniff'
    # Файл личный: общим кешам его хранить незачем
    response['Cache-Control'] = 'private, max-age=3600'
    return response
