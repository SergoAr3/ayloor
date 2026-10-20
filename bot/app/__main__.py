import asyncio
import logging

from aiogram import Bot, Dispatcher
from ayloor_bot.config import BotSettings
from ayloor_bot.handlers import router


async def main() -> None:
    settings = BotSettings()
    # No FSM or per-user invite state: each /start independently builds its URL.
    dispatcher = Dispatcher(disable_fsm=True)
    dispatcher.include_router(router)
    async with Bot(settings.telegram_bot_token.get_secret_value()) as bot:
        await dispatcher.start_polling(bot, settings=settings, allowed_updates=["message"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
