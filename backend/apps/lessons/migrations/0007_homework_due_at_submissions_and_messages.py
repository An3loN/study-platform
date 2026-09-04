# Сгенерировано Django 5.1.4, порядок операций поправлен вручную:
# отметки «выполнено» переносятся в HomeworkSubmission ДО удаления M2M,
# иначе они пропали бы вместе с колонкой.

import django.core.validators
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def move_completed_to_submissions(apps, schema_editor):
    """Кто уже отметил задание выполненным — тому заводим сдачу с отметкой."""
    Homework = apps.get_model('lessons', 'Homework')
    HomeworkSubmission = apps.get_model('lessons', 'HomeworkSubmission')

    submissions = []
    for homework in Homework.objects.prefetch_related('completed_by'):
        for student in homework.completed_by.all():
            submissions.append(HomeworkSubmission(
                homework=homework,
                student=student,
                is_done=True,
                done_at=homework.created_at,
            ))
    HomeworkSubmission.objects.bulk_create(submissions, ignore_conflicts=True)


def move_submissions_back(apps, schema_editor):
    Homework = apps.get_model('lessons', 'Homework')
    HomeworkSubmission = apps.get_model('lessons', 'HomeworkSubmission')

    for homework in Homework.objects.all():
        done = HomeworkSubmission.objects.filter(homework=homework, is_done=True)
        homework.completed_by.set([submission.student for submission in done])


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0006_lesson_has_whiteboard'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='homework',
            name='due_at',
            field=models.DateTimeField(blank=True, help_text='Пусто — до следующего урока.', null=True, verbose_name='Сдать до'),
        ),
        migrations.CreateModel(
            name='HomeworkMessage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('text', models.TextField(blank=True, verbose_name='Сообщение')),
                ('attachment', models.FileField(blank=True, null=True, upload_to='homework/messages/%Y/%m/', verbose_name='Файл')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='homework_messages', to=settings.AUTH_USER_MODEL, verbose_name='Автор')),
                ('homework', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='lessons.homework', verbose_name='Задание')),
            ],
            options={
                'verbose_name': 'Сообщение по заданию',
                'verbose_name_plural': 'Сообщения по заданиям',
                'ordering': ['created_at'],
            },
        ),
        migrations.CreateModel(
            name='HomeworkSubmission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('is_done', models.BooleanField(default=False, verbose_name='Ученик отметил выполненным')),
                ('done_at', models.DateTimeField(blank=True, null=True, verbose_name='Когда отметил')),
                ('accepted_at', models.DateTimeField(blank=True, null=True, verbose_name='Принято преподавателем')),
                ('revision_requested_at', models.DateTimeField(blank=True, null=True, verbose_name='Запрошены поправки')),
                ('grade', models.PositiveSmallIntegerField(blank=True, help_text='По пятибалльной шкале. Необязательна.', null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)], verbose_name='Оценка')),
                ('homework', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='lessons.homework', verbose_name='Задание')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='homework_submissions', to=settings.AUTH_USER_MODEL, verbose_name='Ученик')),
            ],
            options={
                'verbose_name': 'Сдача домашнего задания',
                'verbose_name_plural': 'Сдачи домашних заданий',
                'constraints': [models.UniqueConstraint(fields=('homework', 'student'), name='unique_submission_per_student')],
            },
        ),
        migrations.RunPython(move_completed_to_submissions, move_submissions_back),
        migrations.RemoveField(
            model_name='homework',
            name='completed_by',
        ),
    ]
