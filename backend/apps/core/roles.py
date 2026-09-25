from django.db import models


class Role(models.TextChoices):
    SUPERADMIN = "superadmin", "Superadmin"
    ADMIN = "admin", "Filial admini"
    TEACHER = "teacher", "O'qituvchi"
