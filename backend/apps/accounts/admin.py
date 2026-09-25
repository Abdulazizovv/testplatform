from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


class UserCreateForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "role", "branch")


class UserEditForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    # Only superadmins are is_staff (enforced in User.save), so this whole admin is
    # the superadmin's tool for creating branch admins/teachers.
    form = UserEditForm
    add_form = UserCreateForm

    list_display = ("username", "get_full_name", "role", "branch", "is_active", "last_login")
    list_filter = ("role", "branch", "is_active")
    search_fields = ("username", "first_name", "last_name")
    ordering = ("username",)
    list_select_related = ("branch",)

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Shaxsiy ma'lumot", {"fields": ("first_name", "last_name", "email")}),
        ("Rol va filial", {"fields": ("role", "branch", "is_active")}),
        ("Sanalar", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "role", "branch", "usable_password", "password1", "password2"),
            },
        ),
    )
