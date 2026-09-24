from rest_framework.pagination import PageNumberPagination


class Pagination(PageNumberPagination):
    """
    Страница по 20, но клиент может попросить до 100 через `?page_size=`.

    Больше — нельзя: там, где список нужен целиком (календарь недели, все
    ученики), фронт идёт по страницам сам (`fetchAll` в services/api.ts),
    а на каждую строку сериализаторы ещё делают запросы в базу.
    """
    page_size_query_param = 'page_size'
    max_page_size = 100
