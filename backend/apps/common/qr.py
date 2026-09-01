from io import BytesIO

import qrcode
import qrcode.image.svg
from django.http import HttpResponse


def qr_svg(data: str) -> bytes:
    """QR-код в SVG. Векторный формат — не нужен Pillow и не мылится при печати."""
    image = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buffer = BytesIO()
    image.save(buffer)
    return buffer.getvalue()


def qr_svg_response(data: str) -> HttpResponse:
    response = HttpResponse(qr_svg(data), content_type='image/svg+xml')
    # Ссылка одноразовая по смыслу — пусть браузер не хранит её картинку
    response['Cache-Control'] = 'no-store'
    return response
