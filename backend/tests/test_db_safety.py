import builtins
import importlib
import os
import runpy
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.core.config import ROOT
from app.core.test_database import DatabaseTestSettings, validate_test_database

APP_URL = "postgresql+asyncpg://user:password@localhost:5432/ayloor"
TEST_URL = "postgresql+asyncpg://user:password@localhost:5432/ayloor_test"


@pytest.fixture
def clean_database_env(monkeypatch):
    for key in ("DATABASE_URL", "TEST_DATABASE_URL", "database_url", "test_database_url"):
        monkeypatch.delenv(key, raising=False)


def test_matching_urls_from_environment_rejected(monkeypatch, clean_database_env):
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", TEST_URL)
    settings = DatabaseTestSettings(_env_file=None)
    with pytest.raises(RuntimeError, match="effective application database"):
        validate_test_database(settings.database_url, settings.test_database_url)


def test_environment_overrides_dotenv_application_url(tmp_path, monkeypatch, clean_database_env):
    env = tmp_path / ".env"
    env.write_text(f"DATABASE_URL={APP_URL}\nTEST_DATABASE_URL={TEST_URL}\n")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    settings = DatabaseTestSettings(_env_file=env)
    assert settings.database_url == TEST_URL
    with pytest.raises(RuntimeError, match="same database"):
        validate_test_database(settings.database_url, settings.test_database_url)


def test_distinct_databases_allowed(tmp_path, clean_database_env):
    env = tmp_path / ".env"
    env.write_text(f"DATABASE_URL={APP_URL}\nTEST_DATABASE_URL={TEST_URL}\n")
    settings = DatabaseTestSettings(_env_file=env)
    assert validate_test_database(settings.database_url, settings.test_database_url) == TEST_URL


@pytest.mark.parametrize("query_override", [False, True])
def test_guard_runs_before_engine_connection_or_sql(
    monkeypatch, clean_database_env, query_override
):
    monkeypatch.setenv("DATABASE_URL", APP_URL if query_override else TEST_URL)
    monkeypatch.setenv(
        "TEST_DATABASE_URL", f"{TEST_URL}?database=ayloor" if query_override else TEST_URL
    )
    engine = Mock(side_effect=AssertionError("Engine must not be created"))
    connect = AsyncMock(side_effect=AssertionError("Database must not be connected"))
    execute = AsyncMock(side_effect=AssertionError("SQL must not be executed"))
    with (
        patch("sqlalchemy.ext.asyncio.create_async_engine", engine),
        patch("asyncpg.connect", connect),
        patch("sqlalchemy.ext.asyncio.AsyncConnection.execute", execute),
        pytest.raises(RuntimeError, match="query parameters|same database"),
    ):
        runpy.run_path(str(Path(__file__).with_name("conftest.py")))
    engine.assert_not_called()
    connect.assert_not_called()
    execute.assert_not_called()


@pytest.mark.parametrize("query_override", [False, True])
async def test_fixture_checks_guard_before_creating_engine(monkeypatch, query_override):
    import conftest

    target = f"{TEST_URL}?database=ayloor" if query_override else TEST_URL
    settings = DatabaseTestSettings(
        database_url=APP_URL if query_override else TEST_URL,
        test_database_url=target,
        _env_file=None,
    )
    engine = Mock(side_effect=AssertionError("Fixture must not create an engine"))
    monkeypatch.setattr(conftest, "database_settings", settings)
    monkeypatch.setattr(conftest, "TEST_URL", target)
    monkeypatch.setattr(conftest, "create_async_engine", engine)
    generator = conftest.database.__wrapped__(monkeypatch)
    with pytest.raises(RuntimeError, match="query parameters|same database"):
        await anext(generator)
    engine.assert_not_called()


def test_pytest_overrides_cannot_be_bypassed_by_lowercase_alias(monkeypatch, clean_database_env):
    monkeypatch.setenv("DATABASE_URL", APP_URL)
    monkeypatch.setenv("database_url", APP_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", TEST_URL)
    with patch.dict(os.environ):
        runpy.run_path(str(Path(__file__).with_name("conftest.py")))
        assert DatabaseTestSettings(_env_file=None).database_url == TEST_URL


@pytest.mark.parametrize(
    "target", [APP_URL, "postgresql+asyncpg://user:pass@localhost", "sqlite:///unsafe_test"]
)
def test_suffix_and_postgresql_requirements_preserved(target):
    with pytest.raises(RuntimeError):
        validate_test_database(None, target)


def test_same_database_name_with_different_credentials_still_rejected():
    with pytest.raises(RuntimeError, match="same database"):
        validate_test_database(TEST_URL.replace("user:password", "other:credentials"), TEST_URL)


def test_connection_database_query_cannot_override_safe_path():
    with pytest.raises(RuntimeError, match="query parameters"):
        validate_test_database(APP_URL, f"{TEST_URL}?database=ayloor")


def test_application_database_query_is_rejected():
    with pytest.raises(RuntimeError, match="query parameters"):
        validate_test_database(f"{APP_URL}?database=ayloor_test", TEST_URL)


def test_implicit_application_database_is_not_assumed_safe():
    with pytest.raises(RuntimeError, match="explicitly identify"):
        validate_test_database("postgresql+asyncpg://ayloor_test:password@localhost", TEST_URL)


@pytest.mark.parametrize(
    "query",
    [
        "database=ayloor",
        "database=ayloor_test",
        "database=",
        "database",
        "%64atabase=ayloor",
        "database=one&database=two",
        "dbname=ayloor",
        "dsn=postgresql%3A%2F%2Flocalhost%2Fayloor",
    ],
)
@pytest.mark.parametrize("application_override", [False, True])
def test_database_query_selectors_fail_closed(query, application_override):
    app_url = f"{APP_URL}?{query}" if application_override else APP_URL
    test_url = TEST_URL if application_override else f"{TEST_URL}?{query}"
    with pytest.raises(RuntimeError, match="query parameters"):
        validate_test_database(app_url, test_url)


@pytest.mark.parametrize(
    "application",
    [TEST_URL, TEST_URL.replace(":5432", ":5433"), TEST_URL.replace("localhost", "127.0.0.1")],
)
def test_same_name_stays_rejected_across_server_aliases_and_ports(application):
    with pytest.raises(RuntimeError, match="same database"):
        validate_test_database(application, TEST_URL)


def test_safe_connection_options_are_preserved():
    target = f"{TEST_URL}?ssl=disable&command_timeout=30"
    assert validate_test_database(APP_URL, target) == target


@pytest.fixture
def tooling(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "scripts"))
    prepare = importlib.import_module("prepare_test_db")
    browser = importlib.import_module("local_smoke_server")
    return prepare, browser


@pytest.fixture
def no_database_side_effects(monkeypatch):
    spies = {}
    for path, asynchronous in (
        ("sqlalchemy.ext.asyncio.create_async_engine", False),
        ("asyncpg.connect", True),
        ("sqlalchemy.ext.asyncio.AsyncConnection.execute", True),
        ("sqlalchemy.ext.asyncio.AsyncSession.execute", True),
        ("asyncio.create_subprocess_exec", True),
        ("app.seed.main", True),
        ("os.execv", False),
    ):
        factory = AsyncMock if asynchronous else Mock
        spy = factory(side_effect=AssertionError(f"Unexpected side effect: {path}"))
        monkeypatch.setattr(path, spy)
        spies[path] = spy
    # The full suite already imported app.seed/session during collection. Catch
    # premature imports too: in a fresh CLI they would create an engine even if
    # these cached modules would hide that side effect in this test process.
    database_import = Mock(side_effect=AssertionError("Database modules imported before guard"))
    original_import = builtins.__import__

    def guarded_import(name, *args, **kwargs):
        if name in {"app.db", "app.db.session", "app.main", "app.seed"}:
            database_import(name)
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", guarded_import)
    spies["database_module_import"] = database_import
    return spies


@pytest.mark.parametrize("entrypoint", ["prepare_test_db.py", "local_smoke_server.py"])
@pytest.mark.parametrize("unsafe", ["query_override", "same_database", "env_over_dotenv"])
@pytest.mark.parametrize("environment_case", ["upper", "lower"])
def test_tooling_cli_rejects_before_any_side_effect(
    entrypoint,
    unsafe,
    environment_case,
    tooling,
    no_database_side_effects,
    monkeypatch,
    tmp_path,
    clean_database_env,
):
    prepare, browser = tooling
    (tmp_path / ".env").write_text(
        f"DATABASE_URL={APP_URL}\nTEST_DATABASE_URL={TEST_URL}\n"
        if unsafe == "env_over_dotenv"
        else ""
    )
    # Each CLI must read this dotenv with process environment still taking priority.
    monkeypatch.setattr("app.core.config.ROOT", tmp_path)
    monkeypatch.setattr(prepare, "ROOT", tmp_path)
    monkeypatch.setattr(browser, "ROOT", tmp_path)
    app_key, test_key = (
        ("DATABASE_URL", "TEST_DATABASE_URL")
        if environment_case == "upper"
        else ("database_url", "test_database_url")
    )
    monkeypatch.setenv(app_key, APP_URL if unsafe == "query_override" else TEST_URL)
    monkeypatch.setenv(
        test_key,
        f"{TEST_URL}?database=ayloor" if unsafe == "query_override" else TEST_URL,
    )
    before = dict(os.environ)
    with pytest.raises(RuntimeError, match="query parameters|same database"):
        runpy.run_path(str(ROOT / "scripts" / entrypoint), run_name="__main__")
    assert dict(os.environ) == before, "Unsafe bootstrap must not install synthetic configuration"
    for spy in no_database_side_effects.values():
        spy.assert_not_called()


async def test_browser_guard_precedes_even_prepare_database(
    tooling, no_database_side_effects, monkeypatch, clean_database_env
):
    _, browser = tooling
    monkeypatch.setenv("DATABASE_URL", APP_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", f"{TEST_URL}?database=ayloor")
    prepare = AsyncMock(side_effect=AssertionError("Migrations must not start"))
    monkeypatch.setattr(browser, "prepare_database", prepare)
    with pytest.raises(RuntimeError, match="query parameters"):
        await browser.prepare()
    prepare.assert_not_called()
    for spy in no_database_side_effects.values():
        spy.assert_not_called()


@pytest.mark.parametrize("lowercase_alias", [False, True])
async def test_safe_prepare_uses_validated_target(
    tooling, monkeypatch, clean_database_env, lowercase_alias
):
    prepare, _ = tooling
    monkeypatch.setenv("DATABASE_URL", APP_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", TEST_URL)
    if lowercase_alias:
        monkeypatch.setenv("database_url", APP_URL)
    connection = Mock(fetchval=AsyncMock(return_value=True), execute=AsyncMock(), close=AsyncMock())
    connect = AsyncMock(return_value=connection)
    process = Mock(wait=AsyncMock(return_value=0))
    subprocess = AsyncMock(return_value=process)
    monkeypatch.setattr(prepare.asyncpg, "connect", connect)
    monkeypatch.setattr(prepare.asyncio, "create_subprocess_exec", subprocess)
    await prepare.main()
    connect.assert_awaited_once_with(
        TEST_URL.replace("+asyncpg", "").replace("ayloor_test", "postgres")
    )
    connection.execute.assert_not_called()
    connection.close.assert_awaited_once()
    assert subprocess.await_args.kwargs["env"]["DATABASE_URL"] == TEST_URL
    with patch.dict(os.environ, subprocess.await_args.kwargs["env"], clear=True):
        assert DatabaseTestSettings(_env_file=None).database_url == TEST_URL
    assert subprocess.await_args.args[-2:] == ("upgrade", "head")


@pytest.mark.parametrize("lowercase_alias", [False, True])
async def test_safe_browser_prepares_then_seeds_validated_target(
    tooling, monkeypatch, clean_database_env, lowercase_alias
):
    _, browser = tooling
    monkeypatch.setenv("DATABASE_URL", APP_URL)
    monkeypatch.setenv("TEST_DATABASE_URL", TEST_URL)
    if lowercase_alias:
        monkeypatch.setenv("database_url", APP_URL)
    steps = []

    async def prepare():
        assert os.environ["DATABASE_URL"] == APP_URL
        assert os.environ["TEST_DATABASE_URL"] == TEST_URL
        steps.append("migrations")

    async def seed():
        assert os.environ["DATABASE_URL"] == TEST_URL
        assert DatabaseTestSettings(_env_file=None).database_url == TEST_URL
        steps.append("seed")

    monkeypatch.setattr(browser, "prepare_database", prepare)
    monkeypatch.setattr("app.seed.main", seed)
    with patch.dict(os.environ):
        await browser.prepare()
    assert steps == ["migrations", "seed"]
