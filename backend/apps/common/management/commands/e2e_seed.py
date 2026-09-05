"""
Учётки под сквозные тесты.

Преподавателя нельзя завести через API: своего маршрута регистрации у него
нет и не будет — доступ раздаёт владелец платформы. Поэтому seed живёт
management-командой: она не торчит наружу ни при каких настройках, в отличие
от служебного HTTP-маршрута, который пришлось бы чем-то закрывать.

Всё остальное — учеников, уроки, задания — тесты создают сами через API.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.users.models import User

TEACHER_PHONE = '+70000000001'
TEACHER_PASSWORD = 'e2eTeacher!7391'


class Command(BaseCommand):
    help = 'Завести преподавателя для сквозных тестов (только для разработки)'

    def handle(self, *args, **options):
        from django.conf import settings

        # Код региона 000 не выдаётся живым абонентам, но подстраховаться стоит:
        # на боевой базе этой команде делать нечего
        if not settings.DEBUG:
            raise CommandError('Только для разработки: с DEBUG=False команда не работает.')

        User.objects.filter(phone=TEACHER_PHONE).delete()
        teacher = User.objects.create_user(
            phone=TEACHER_PHONE,
            password=TEACHER_PASSWORD,
            role=User.ROLE_TEACHER,
            first_name='Тест',
            last_name='Преподавателев',
        )
        self.stdout.write(f'teacher {teacher.id} {TEACHER_PHONE}')
