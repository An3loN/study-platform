import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def fill_teacher(apps, schema_editor):
    """
    До сих пор преподаватель задания выводился из урока. Теперь он хранится
    рядом с заданием — у заданий без урока выводить его неоткуда, — поэтому
    переносим то, что уже есть.
    """
    Homework = apps.get_model('lessons', 'Homework')
    for homework in Homework.objects.select_related('lesson').iterator():
        homework.teacher_id = homework.lesson.teacher_id
        homework.save(update_fields=['teacher'])


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0008_homeworkmessage_student'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='homework',
            name='lesson',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='homework',
                to='lessons.lesson',
                verbose_name='Урок',
                help_text='Можно не указывать: задание не обязано быть привязано к занятию.',
            ),
        ),
        # Сначала поле допускает пустоту — иначе его некуда добавить к уже
        # существующим строкам; заполняем и только потом требуем обязательности.
        migrations.AddField(
            model_name='homework',
            name='teacher',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='assigned_homework',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Преподаватель',
            ),
        ),
        migrations.AddField(
            model_name='homework',
            name='students',
            field=models.ManyToManyField(
                blank=True,
                related_name='personal_homework',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Кому задано',
                help_text='Только для заданий без урока: с уроком адресаты берутся из него.',
            ),
        ),
        migrations.RunPython(fill_teacher, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='homework',
            name='teacher',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='assigned_homework',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Преподаватель',
            ),
        ),
    ]
