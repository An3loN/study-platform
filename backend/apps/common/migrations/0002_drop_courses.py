from django.db import migrations

# Приложение apps.courses удалено: `Lesson` намеренно не привязан ни к курсу,
# ни к теме, во фронтенде курсов не было ни разу, а `apps.courses.urls` так и
# не подключили. Таблицы при этом создавались — их и убираем.
#
# Миграция живёт в `common`, а не в самом приложении: вместе с приложением
# исчезли бы и его миграции, и на машине, где таблицы уже есть, удалять их
# стало бы нечем. Отсюда же `IF EXISTS` — на чистой базе таблиц просто нет.
#
# Заодно чистим следы в служебных таблицах: без этого в админке остались бы
# права на несуществующие модели, а Django считал бы миграции courses
# применёнными.
DROP = """
DROP TABLE IF EXISTS courses_enrollment;
DROP TABLE IF EXISTS courses_course;

DELETE FROM auth_permission
 WHERE content_type_id IN (SELECT id FROM django_content_type WHERE app_label = 'courses');
DELETE FROM django_content_type WHERE app_label = 'courses';
DELETE FROM django_migrations WHERE app = 'courses';
"""


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0001_initial'),
    ]

    operations = [
        # Обратной операции нет: восстановить удалённые таблицы неоткуда,
        # а пустые пересоздавать бессмысленно
        migrations.RunSQL(DROP, reverse_sql=migrations.RunSQL.noop),
    ]
