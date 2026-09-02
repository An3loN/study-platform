from django.db import models


class SiteSettings(models.Model):
    """
    Настройки, которые правит преподаватель из админки. Строка всегда одна.

    Значения применяются к тому, что создаётся после правки: у приглашений
    срок проставляется при выдаче и дальше не пересчитывается, иначе
    уменьшение срока мгновенно погасило бы уже разосланные ссылки.
    """
    invite_ttl_days = models.PositiveIntegerField(
        default=7,
        verbose_name='Срок жизни приглашения ученика, дней',
        help_text='Отсчитывается от момента выдачи приглашения.',
    )
    share_ttl_days = models.PositiveIntegerField(
        default=2,
        verbose_name='Срок жизни ссылки на урок, дней',
        help_text=(
            'Отсчитывается от конца урока, а не от создания ссылки: '
            'иначе ссылка на урок через неделю протухла бы до самого урока.'
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Настройки платформы'
        verbose_name_plural = 'Настройки платформы'

    def __str__(self):
        return 'Настройки платформы'

    def save(self, *args, **kwargs):
        # Строка одна: не даём развести несколько наборов настроек
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings
