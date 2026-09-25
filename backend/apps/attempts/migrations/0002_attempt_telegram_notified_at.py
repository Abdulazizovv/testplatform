from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("attempts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="attempt",
            name="telegram_notified_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
    ]
