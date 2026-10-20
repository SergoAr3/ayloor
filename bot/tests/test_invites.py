from unittest.mock import AsyncMock

import pytest
from aiogram.filters import CommandObject
from ayloor_bot.config import BotSettings
from ayloor_bot.handlers import invitation_url, start


def test_invite_url_stateless():
    base = "https://ayloor.example/app?lang=en"
    first, invited = invitation_url(base, "join_abc-123_X")
    assert invited and first == "https://ayloor.example/app?lang=en&invite=abc-123_X"
    plain, invited = invitation_url(base, None)
    assert not invited and plain == base
    second, _ = invitation_url(base, "join_other")
    assert "abc-123_X" not in second


@pytest.mark.parametrize(
    "parameter", ["", "join_", "bad", "join_<script>", "join_a&admin=1", "join_" + "a" * 41]
)
def test_invalid_start_parameter(parameter):
    assert invitation_url("https://ayloor.example", parameter) == ("https://ayloor.example", False)


def test_stale_invite_removed():
    assert (
        invitation_url("https://ayloor.example?invite=old&lang=en", None)[0]
        == "https://ayloor.example?lang=en"
    )


@pytest.mark.asyncio
async def test_start_button():
    message = AsyncMock()
    message.chat.type = "private"
    settings = BotSettings(
        telegram_bot_token="123456:test-token", telegram_webapp_url="https://ayloor.example"
    )
    await start(message, CommandObject(command="start", args="join_test-code"), settings)
    markup = message.answer.call_args.kwargs["reply_markup"]
    button = markup.inline_keyboard[0][0]
    assert button.text == "JOIN AYLOOR TEAM"
    assert button.web_app.url == "https://ayloor.example?invite=test-code"


@pytest.mark.asyncio
async def test_group_has_no_webapp_button():
    message = AsyncMock()
    message.chat.type = "group"
    settings = BotSettings(
        telegram_bot_token="123456:test-token", telegram_webapp_url="https://ayloor.example"
    )
    await start(message, CommandObject(command="start"), settings)
    assert "reply_markup" not in message.answer.call_args.kwargs
