"""
Общие фикстуры. Почти каждому тесту нужна одна и та же связка «преподаватель
и его ученики», поэтому она собрана здесь, а не повторяется в каждом файле.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.lessons.models import Homework, Lesson
from apps.users.models import User


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def teacher(db):
    return User.objects.create_user(
        phone='+79990000001', password='teacherpass1', role=User.ROLE_TEACHER,
        first_name='Мария', last_name='Иванова',
    )


@pytest.fixture
def other_teacher(db):
    """Чужой преподаватель: им проверяется, что данные не видны на сторону."""
    return User.objects.create_user(
        phone='+79990000009', password='otherpass1', role=User.ROLE_TEACHER,
        first_name='Пётр', last_name='Петров',
    )


@pytest.fixture
def student(db, teacher):
    return User.objects.create_user(
        phone='+79990000002', password='studentpass1', teacher=teacher,
        first_name='Матвей',
    )


@pytest.fixture
def classmate(db, teacher):
    return User.objects.create_user(
        phone='+79990000003', password='matepass1', teacher=teacher,
        first_name='Кира',
    )


@pytest.fixture
def stranger(db, other_teacher):
    """Ученик чужого преподавателя."""
    return User.objects.create_user(
        phone='+79990000008', password='strangerpass1', teacher=other_teacher,
        first_name='Аноним',
    )


@pytest.fixture
def now():
    return timezone.now()


# Отличает «время не передали» от «передали пустое»: урок без даты — законное
# состояние, и `at=None` должно означать именно его
UNSET = object()


@pytest.fixture
def make_lesson(db, teacher):
    """
    Урок с участниками. Время по умолчанию — в будущем: у теста, которому
    время безразлично, урок не должен внезапно оказаться идущим.
    """
    def _make(students=(), *, at=UNSET, duration=60, owner=None, **fields):
        lesson = Lesson.objects.create(
            teacher=owner or teacher,
            scheduled_at=timezone.now() + timedelta(days=1) if at is UNSET else at,
            duration=duration,
            **fields,
        )
        lesson.students.set(students)
        return lesson
    return _make


@pytest.fixture
def make_homework(db, teacher):
    def _make(lesson=None, students=(), *, owner=None, text='Задание', **fields):
        homework = Homework.objects.create(
            teacher=owner or teacher, lesson=lesson, text=text, **fields,
        )
        if students:
            homework.students.set(students)
        return homework
    return _make


# Каждой роли — свой клиент, а не общий `api`: тест, который дёргает и
# преподавателя, и ученика, иначе получил бы один объект, где второй
# force_authenticate молча перебивает первый
@pytest.fixture
def as_teacher(teacher):
    client = APIClient()
    client.force_authenticate(teacher)
    return client


@pytest.fixture
def as_student(student):
    client = APIClient()
    client.force_authenticate(student)
    return client


@pytest.fixture
def as_stranger(stranger):
    """Ученик чужого преподавателя: им проверяется, что за забор не видно."""
    client = APIClient()
    client.force_authenticate(stranger)
    return client
