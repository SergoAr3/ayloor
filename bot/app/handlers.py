import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from ayloor_bot.config import BotSettings

router = Router()


def invitation_url(base_url: str, start_parameter: str | None) -> tuple[str, bool]:
    match = re.fullmatch(r"join_([A-Za-z0-9_-]{1,40})", start_parameter or "")
    parsed = urlsplit(base_url)
    # A stale invite query must not leak into ordinary /start launches.
    query = [(key, value) for key, value in parse_qsl(parsed.query) if key != "invite"]
    if match:
        query.append(("invite", match.group(1)))
    return urlunsplit(parsed._replace(query=urlencode(query))), match is not None


@router.message(CommandStart())
async def start(message: Message, command: CommandObject, settings: BotSettings) -> None:
    if message.chat.type != "private":
        await message.answer("Open AYLOOR in a private chat with this bot.")
        return
    url, invited = invitation_url(settings.telegram_webapp_url, command.args)
    await message.answer(
        "AYLOOR\nPlay the real world.\n\nYEREVAN — SEASON ZERO\nThe city is your game.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="JOIN AYLOOR TEAM" if invited else "OPEN AYLOOR",
                        web_app=WebAppInfo(url=url),
                    ),
                ]
            ]
        ),
    )
