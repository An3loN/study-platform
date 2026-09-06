"""
Вход и учётные записи.

Логин — телефон, и он же `USERNAME_FIELD`. Поле `username` из `AbstractUser`
убрано совсем, поэтому здесь же проверяются следствия: собственный менеджер
и переопределённый `clean()`, без которых ученик без телефона ломал бы unique.
"""
import pytest
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User, normalize_phone

pytestmark = pytest.mark.django_db


# ── Вход ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('typed', [
    '+79990000001',
    '+7 (999) 000-00-01',
    '+7 999 000-00-01',
    '  +79990000001  ',
])
def test_formatting_does_not_affect_login(api, teacher, typed):
    """
    Скобки, пробелы и дефисы снимаются до сравнения: человек набирает номер
    как привык, а в базе он один.
    """
    response = api.post('/api/auth/login/', {'phone': typed, 'password': 'teacherpass1'})
    assert response.status_code == 200, typed


def test_backend_does_not_convert_leading_eight(api, teacher):
    """
    `normalize_phone` снимает только оформление: «8999…» остаётся «8999…» и
    в +7 не превращается. Приводит форму маска на фронте (`utils/phone.ts`),
    и до API номер доходит уже с кодом страны.

    Следствие, о котором стоит помнить: обращаясь к API напрямую, тем же
    номером в двух записях можно завести две учётки.
    """
    assert normalize_phone('8 999 000-00-01') == '89990000001'

    response = api.post('/api/auth/login/', {'phone': '8 999 000-00-01', 'password': 'teacherpass1'})
    assert response.status_code == 401


def test_wrong_password_is_401(api, teacher):
    response = api.post('/api/auth/login/', {'phone': teacher.phone, 'password': 'мимо'})

    assert response.status_code == 401
    assert 'Неверный' in str(response.data)


def test_unknown_phone_is_401(api, db):
    """Тот же ответ, что и на неверный пароль: перебирать номера незачем."""
    response = api.post('/api/auth/login/', {'phone': '+79991112233', 'password': 'что-нибудь'})
    assert response.status_code == 401


def test_inactive_user_cannot_log_in(api, teacher):
    teacher.is_active = False
    teacher.save()

    assert api.post('/api/auth/login/', {
        'phone': teacher.phone, 'password': 'teacherpass1',
    }).status_code == 401


def test_login_returns_a_working_pair(api, teacher):
    response = api.post('/api/auth/login/', {
        'phone': teacher.phone, 'password': 'teacherpass1',
    })

    assert set(response.data) == {'access', 'refresh'}
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
    assert api.get('/api/auth/me/').status_code == 200


# ── Кто я ────────────────────────────────────────────────────────────────────

def test_me_returns_the_current_user(as_teacher, teacher):
    data = as_teacher.get('/api/auth/me/').data

    assert data['id'] == str(teacher.id)
    assert data['role'] == 'teacher'
    assert data['display_name'] == 'Мария Иванова'


def test_me_needs_authentication(api):
    assert api.get('/api/auth/me/').status_code == 401


def test_me_does_not_let_role_be_changed(as_student, student):
    """Ученик не может выписать себе преподавателя."""
    as_student.patch('/api/auth/me/', {'role': 'teacher'})

    student.refresh_from_db()
    assert student.role == User.ROLE_STUDENT


# ── Обновление токенов ───────────────────────────────────────────────────────

def test_refresh_issues_a_new_access(api, teacher):
    refresh = str(RefreshToken.for_user(teacher))
    response = api.post('/api/auth/refresh/', {'refresh': refresh})

    assert response.status_code == 200
    assert 'access' in response.data


def test_old_refresh_stops_working_after_rotation(api, teacher):
    """
    BLACKLIST_AFTER_ROTATION: раньше старый refresh оставался валидным
    все семь дней, то есть кража одного давала неделю доступа.
    """
    first = str(RefreshToken.for_user(teacher))
    rotated = api.post('/api/auth/refresh/', {'refresh': first})
    assert rotated.status_code == 200

    again = api.post('/api/auth/refresh/', {'refresh': first})
    assert again.status_code == 401


def test_garbage_refresh_is_401(api, db):
    assert api.post('/api/auth/refresh/', {'refresh': 'не-токен'}).status_code == 401


# ── Телефон как USERNAME_FIELD ───────────────────────────────────────────────

def test_username_field_is_phone():
    assert User.USERNAME_FIELD == 'phone'
    assert User.REQUIRED_FIELDS == []
    assert not hasattr(User, 'username') or User.username is None


def test_superuser_requires_a_phone(db):
    """Ему телефоном входить — без него учётка бесполезна."""
    with pytest.raises(ValueError):
        User.objects.create_superuser(phone=None, password='supersecret9182')


def test_superuser_is_a_teacher_by_default(db):
    admin = User.objects.create_superuser(phone='+79994443322', password='supersecret9182')

    assert admin.is_staff and admin.is_superuser
    assert admin.role == User.ROLE_TEACHER
    assert admin.check_password('supersecret9182')


def test_student_may_have_no_phone(db, teacher):
    """Карточку заводят до регистрации — логина у ученика ещё нет."""
    student = User.objects.create_user(phone=None, teacher=teacher, first_name='Анна')

    assert student.phone is None
    assert not student.has_usable_password()


def test_several_students_without_phone_coexist(db, teacher):
    """В Postgres несколько NULL не нарушают unique — на это и расчёт."""
    User.objects.create_user(phone=None, teacher=teacher, first_name='Анна')
    User.objects.create_user(phone=None, teacher=teacher, first_name='Борис')

    assert User.objects.filter(phone__isnull=True).count() == 2


def test_clean_does_not_turn_missing_phone_into_a_string(db, teacher):
    """
    `AbstractBaseUser.clean()` прогоняет USERNAME_FIELD через
    `normalize_username`, и без своего `clean()` пустой телефон стал бы
    строкой «None» — а двое таких столкнулись бы на unique.
    """
    student = User(teacher=teacher, first_name='Анна')
    student.clean()

    assert student.phone is None


def test_phone_is_normalised_on_save(db, teacher):
    student = User.objects.create_user(phone='+7 (999) 555-00-00', teacher=teacher)

    student.refresh_from_db()
    assert student.phone == '+79995550000'


@pytest.mark.parametrize('raw,expected', [
    ('+7 (999) 123-45-67', '+79991234567'),
    ('8-999-123-45-67', '89991234567'),
    ('', None),
    (None, None),
    ('   ', None),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


# ── Отображаемое имя ─────────────────────────────────────────────────────────

def test_display_name_prefers_alias(db, teacher):
    user = User.objects.create_user(
        phone='+79995550001', teacher=teacher,
        first_name='Иван', last_name='Иванов', alias='Ваня',
    )
    assert user.display_name == 'Ваня'


def test_display_name_falls_back_to_full_name(db, teacher):
    user = User.objects.create_user(
        phone='+79995550002', teacher=teacher, first_name='Иван', last_name='Иванов',
    )
    assert user.display_name == 'Иван Иванов'


def test_display_name_falls_back_to_phone(db, teacher):
    user = User.objects.create_user(phone='+79995550003', teacher=teacher)
    assert user.display_name == '+79995550003'


def test_display_name_never_comes_out_empty(db, teacher):
    """Раньше здесь подставлялся username — вида «student-3f2a91c8b4»."""
    user = User.objects.create_user(phone=None, teacher=teacher)
    assert user.display_name == 'Без имени'


# ── Пароли ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('weak', ['123', 'password', '12345678', 'qwerty'])
def test_weak_passwords_are_rejected_by_validators(weak):
    with pytest.raises(ValidationError):
        validate_password(weak)
