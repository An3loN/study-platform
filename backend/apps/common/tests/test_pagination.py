"""
Размер страницы: по умолчанию 20, по просьбе клиента — до 100.

Календарь и список учеников нужны целиком. Раньше они брали первую страницу
и молча теряли всё, что сверх двадцати; теперь фронт идёт по страницам,
и крупная страница избавляет его от лишних запросов.
"""
import pytest

from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def many_students(teacher):
    User.objects.bulk_create([
        User(teacher=teacher, first_name=f'Ученик {i:03}', phone=None) for i in range(120)
    ])


def test_default_page_is_twenty(as_teacher, many_students):
    data = as_teacher.get('/api/students/').data

    assert len(data['results']) == 20
    assert data['count'] == 120


def test_client_may_ask_for_a_bigger_page(as_teacher, many_students):
    data = as_teacher.get('/api/students/', {'page_size': 100}).data

    assert len(data['results']) == 100
    assert data['next'] is not None


def test_page_size_is_capped(as_teacher, many_students):
    data = as_teacher.get('/api/students/', {'page_size': 1000}).data

    assert len(data['results']) == 100


def test_pages_add_up_to_everything(as_teacher, many_students):
    first = as_teacher.get('/api/students/', {'page_size': 100, 'page': 1}).data
    second = as_teacher.get('/api/students/', {'page_size': 100, 'page': 2}).data

    ids = {row['id'] for row in first['results'] + second['results']}
    assert len(ids) == 120
    assert second['next'] is None
