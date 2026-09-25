from rest_framework import serializers

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "slug", "address", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
