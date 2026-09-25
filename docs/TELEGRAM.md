# Telegram result notifications

Every finished (or time-expired) attempt sends one message to Telegram. Off until configured.

1. In Telegram open **@BotFather**, send `/newbot`, follow the steps and copy the token.
2. Add the bot to the group (or make it an admin of the channel) that should receive results.
3. Send any message in that group, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and find `"chat":{"id":-100...}`.
   Group/channel ids are negative (`-1001234567890`).
4. In `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_CHAT_ID=<shared chat id>
   PUBLIC_BASE_URL=https://<your-domain>   # only for the "Batafsil ko'rish" link; empty = no link
   ```
   The link points to the staff panel (login required), never to the student's secret result link.
5. Recreate the containers so they read the new env:
   `docker compose up -d backend celery`
6. Verify: `docker compose exec backend python manage.py telegram_test`
   (optionally `--chat-id <id>` or `--branch <slug>`). It prints the bot name and sends a test message.

Per-branch chat: superadmin sets "Telegram chat ID" on the Filiallar page; that branch's results
go there, everything else goes to `TELEGRAM_CHAT_ID`. Never commit the token. Design: decisions #33-#34.
