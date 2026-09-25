from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.branches.models import Branch
from apps.content.scoping import subjects_for
from apps.core.roles import Role

from .models import User


class BranchBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "slug")
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    branch = BranchBriefSerializer(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "role", "branch")
        read_only_fields = fields


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)


class _ScopedSubjectsField(serializers.PrimaryKeyRelatedField):
    default_error_messages = {"does_not_exist": "Fan topilmadi.", "incorrect_type": "Fan topilmadi."}

    def get_queryset(self):
        return subjects_for(self.context["request"].user)


class ManagedUserSerializer(serializers.ModelSerializer):
    """
    Staff-panel user management (superadmin: everyone; branch admin: own branch only).
    Rules enforced here: branch comes from the requester (admins), branch is immutable,
    admins can't create/promote superadmins, nobody changes their own role or deactivates
    themselves, teachers get only subjects of their own branch.
    """

    branch = BranchBriefSerializer(read_only=True)
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch", queryset=Branch.objects.all(), write_only=True, required=False
    )
    password = serializers.CharField(write_only=True, required=False, max_length=256, trim_whitespace=False)
    subjects = _ScopedSubjectsField(many=True, required=False)

    class Meta:
        model = User
        fields = (
            "id", "username", "first_name", "last_name", "role", "is_active", "branch",
            "branch_id", "password", "subjects", "last_login", "created_at",
        )  # fmt: skip
        read_only_fields = ("id", "branch", "last_login", "created_at")

    def validate(self, attrs):
        me = self.context["request"].user
        instance = self.instance
        creating = instance is None

        role = attrs.get("role", None if creating else instance.role)
        if creating and role is None:
            raise serializers.ValidationError({"role": "Rolni tanlang."})
        if role == Role.SUPERADMIN and me.role != Role.SUPERADMIN:
            raise PermissionDenied("Superadmin yaratish yoki tayinlashga ruxsat yo'q.")

        if creating:
            if me.role == Role.SUPERADMIN:
                branch = attrs.get("branch")
                if role == Role.SUPERADMIN:
                    branch = None
                elif branch is None:
                    raise serializers.ValidationError({"branch_id": "Filialni ko'rsating."})
            else:
                branch = me.branch  # never taken from the request body
            attrs["branch"] = branch
            if not attrs.get("password"):
                raise serializers.ValidationError({"password": "Parolni kiriting."})
        else:
            attrs.pop("branch", None)  # a user never changes branch
            if "role" in attrs and attrs["role"] != instance.role:
                if instance.pk == me.pk:
                    raise PermissionDenied("O'z rolingizni o'zgartira olmaysiz.")
                if instance.role == Role.SUPERADMIN or role == Role.SUPERADMIN:
                    raise serializers.ValidationError({"role": "Superadmin rolini o'zgartirib bo'lmaydi."})
            if instance.pk == me.pk and attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "O'zingizni faolsizlantira olmaysiz."})
            branch = instance.branch

        if attrs.get("password"):
            try:
                validate_password(attrs["password"], user=User(username=attrs.get("username", "")))
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": list(exc.messages)})

        subjects = attrs.get("subjects")
        if role != Role.TEACHER:
            if subjects:
                raise serializers.ValidationError({"subjects": "Fan faqat o'qituvchiga biriktiriladi."})
            if not creating and "role" in attrs:
                attrs["subjects"] = []  # moved away from teacher: drop assignments
        elif subjects and any(s.branch_id != branch.id for s in subjects):
            raise serializers.ValidationError({"subjects": "Fan o'qituvchining filialiga tegishli emas."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        subjects = validated_data.pop("subjects", [])
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        user.subjects.set(subjects)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        subjects = validated_data.pop("subjects", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if subjects is not None:
            instance.subjects.set(subjects)
        return instance
