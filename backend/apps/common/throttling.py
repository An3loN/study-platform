import math

from rest_framework import exceptions
from rest_framework.throttling import ScopedRateThrottle


class ScopedThrottleMixin:
    """
    Лимит частоты запросов по `throttle_scope` и понятное сообщение о нём.

    Своё сообщение, а не штатное: DRF подставляет число секунд в строку до
    перевода, перевод не находится, и по-русски выходила только половина —
    «…Expected available in 35 seconds.»
    """
    throttle_classes = [ScopedRateThrottle]
    throttle_message = 'Слишком много попыток.'

    def throttled(self, request, wait):
        seconds = max(1, math.ceil(wait or 0))
        exc = exceptions.Throttled(detail=f'{self.throttle_message} Повторите через {seconds} с.')
        # Retry-After ставит обработчик исключений DRF — по этому полю
        exc.wait = seconds
        raise exc
