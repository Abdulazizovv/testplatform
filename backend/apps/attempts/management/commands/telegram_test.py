from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.attempts.services import telegram
from apps.branches.models import Branch


class Command(BaseCommand):
    help = "Telegram sozlamalarini tekshiradi va sinov xabarini yuboradi (token hech qachon chiqarilmaydi)."

    def add_arguments(self, parser):
        parser.add_argument("--chat-id", help="Sinov xabari yuboriladigan chat (standart: TELEGRAM_CHAT_ID)")
        parser.add_argument("--branch", help="Filial slug'i: shu filialning chatiga (bo'lmasa umumiy)")

    def handle(self, *args, **opts):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError(
                "TELEGRAM_BOT_TOKEN sozlanmagan. .env ni to'ldirib, konteynerlarni qayta ishga tushiring."
            )
        try:
            me = telegram.api_call("getMe")
        except telegram.TelegramError as e:
            raise CommandError(f"Token noto'g'ri yoki Telegramga ulanib bo'lmadi: {e}")
        self.stdout.write(self.style.SUCCESS(f"Bot topildi: @{me.get('username')}"))

        chat_id = opts["chat_id"]
        if opts["branch"]:
            branch = Branch.objects.filter(slug=opts["branch"]).first()
            if branch is None:
                raise CommandError(f"Filial topilmadi: {opts['branch']}")
            chat_id = chat_id or telegram.chat_id_for(branch)
        chat_id = chat_id or settings.TELEGRAM_CHAT_ID
        if not chat_id:
            raise CommandError("Chat ID yo'q: TELEGRAM_CHAT_ID ni to'ldiring yoki --chat-id bering.")

        base = settings.PUBLIC_BASE_URL or "(bo'sh: xabarda havola bo'lmaydi)"
        self.stdout.write(f"PUBLIC_BASE_URL: {base}")
        try:
            text = "✅ <b>Sinov xabari</b>\nTelegram bildirishnomalari to'g'ri ulangan."
            telegram.send_message(chat_id, text)
        except telegram.TelegramError as e:
            raise CommandError(
                f"Xabar yuborilmadi (chat {chat_id}): {e}. "
                "Bot guruhga/kanalga qo'shilganini va chat ID to'g'riligini tekshiring."
            )
        self.stdout.write(self.style.SUCCESS(f"Sinov xabari yuborildi: chat {chat_id}"))
