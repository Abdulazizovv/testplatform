from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("branches", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="branch",
            name="telegram_chat_id",
            field=models.CharField(blank=True, max_length=64, verbose_name="Telegram chat ID"),
        ),
    ]
