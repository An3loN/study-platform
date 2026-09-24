"""
Состояние доски — байтами, а не base64-текстом.

Обычный AlterField здесь не годится: Postgres превратил бы текст в байты
буквально (`state::bytea`), то есть сохранил бы сами символы base64, и доска
не загрузилась бы. Поэтому колонка меняет тип с раскодированием на месте.
Обратно — так же, с кодированием; перевод строк, который Postgres
вставляет в base64 каждые 76 символов, убирается.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('whiteboard', '0002_delete_whiteboardsnapshot'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                'ALTER TABLE whiteboard_whiteboardyjsstate '
                "ALTER COLUMN state TYPE bytea USING decode(state, 'base64')"
            ),
            reverse_sql=(
                'ALTER TABLE whiteboard_whiteboardyjsstate '
                "ALTER COLUMN state TYPE text USING translate(encode(state, 'base64'), E'\\n', '')"
            ),
            state_operations=[
                migrations.AlterField(
                    model_name='whiteboardyjsstate',
                    name='state',
                    field=models.BinaryField(verbose_name='Yjs state'),
                ),
            ],
        ),
    ]
