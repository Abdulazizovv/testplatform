import uuid

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from apps.core.roles import Role


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        """`manage.py createsuperuser` lands here: always role=superadmin, no branch."""
        extra_fields["role"] = Role.SUPERADMIN
        extra_fields["branch"] = None
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """
    Platform staff account (username + password only; there is no self-registration).

    superadmin: developer/owner, no branch, sees everything, uses Django admin.
    admin:      branch administrator, MUST belong to a branch.
    teacher:    MUST belong to a branch; works only with the subjects assigned to them.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField("Rol", max_length=20, choices=Role.choices)
    branch = models.ForeignKey(
        "branches.Branch",
        verbose_name="Filial",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )
    subjects = models.ManyToManyField(
        "content.Subject",
        verbose_name="Fanlar",
        blank=True,
        related_name="teachers",
        help_text="Faqat o'qituvchi uchun: u ishlay oladigan fanlar (o'z filialidagi).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    REQUIRED_FIELDS = []  # createsuperuser asks for username + password only

    class Meta:
        ordering = ["username"]
        verbose_name = "Foydalanuvchi"
        verbose_name_plural = "Foydalanuvchilar"
        constraints = [
            models.CheckConstraint(
                name="user_role_branch_consistent",
                condition=(
                    Q(role=Role.SUPERADMIN, branch__isnull=True)
                    | Q(role__in=[Role.ADMIN, Role.TEACHER], branch__isnull=False)
                ),
                violation_error_message=(
                    "Superadmin filialsiz bo'lishi, admin va o'qituvchi esa filialga "
                    "biriktirilgan bo'lishi shart."
                ),
            ),
        ]

    @property
    def is_operational(self):
        """Active account AND (superadmin OR the user's branch is active)."""
        if not self.is_active:
            return False
        if self.role == Role.SUPERADMIN:
            return True
        return self.branch_id is not None and self.branch.is_active

    def clean(self):
        super().clean()
        if self.role == Role.SUPERADMIN and self.branch_id is not None:
            raise ValidationError({"branch": "Superadmin filialga biriktirilmaydi."})
        if self.role in (Role.ADMIN, Role.TEACHER) and self.branch_id is None:
            raise ValidationError({"branch": "Admin va o'qituvchi uchun filial majburiy."})

    def save(self, *args, **kwargs):
        # Django-admin access and blanket permissions are derived from the role, never
        # set independently - so a branch admin can never reach /admin/.
        is_super = self.role == Role.SUPERADMIN
        self.is_staff = is_super
        self.is_superuser = is_super
        super().save(*args, **kwargs)
