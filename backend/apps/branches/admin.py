from django.contrib import admin

from .models import Branch


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "address", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "address")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
