"""
Убрать за сквозными тестами.

Ученики, уроки и задания уходят каскадом за преподавателем, так что достаточно
удалить его одного.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.users.models import User

from .e2e_seed import TEACHER_PHONE


class Command(BaseCommand):
    help = 'Удалить данные сквозных тестов (только для разработки)'

    def handle(self, *args, **options):
        from django.conf import settings

        if not settings.DEBUG:
            raise CommandError('Только для разработки: с DEBUG=False команда не работает.')

        # Учеников этого преподавателя ссылка не каскадит: teacher — SET_NULL
        students = User.objects.filter(teacher__phone=TEACHER_PHONE)
        removed = students.count()
        students.delete()
        User.objects.filter(phone=TEACHER_PHONE).delete()

        self.stdout.write(f'purged: преподаватель и {removed} учеников')
