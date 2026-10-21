"""Foreground dev processes, with cleanup of their own POSIX process groups."""

import os
import signal
import subprocess
import time
from types import FrameType

COMMANDS = (
    (
        "backend",
        (
            ".venv/bin/uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload",
        ),
    ),
    ("bot", (".venv/bin/python", "-m", "ayloor_bot")),
    (
        "miniapp",
        (
            "npm",
            "--prefix",
            "miniapp",
            "run",
            "dev",
            "--",
            "--port",
            "5173",
            "--strictPort",
        ),
    ),
)


def signal_group(process: subprocess.Popen, signum: int) -> bool:
    try:
        os.killpg(process.pid, signum)
    except ProcessLookupError:
        return False
    return True


def stop_processes(processes: list[subprocess.Popen]) -> None:
    # Signal groups even when the direct parent exited: npm/reload workers may
    # still be running. Never use a broad pkill or touch pre-existing services.
    for process in processes:
        signal_group(process, signal.SIGTERM)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        for process in processes:
            process.poll()  # Reap direct children so their zombies do not keep groups alive.
        if not any(signal_group(process, 0) for process in processes):
            break
        time.sleep(0.1)
    for process in processes:
        signal_group(process, signal.SIGKILL)
        process.wait()


def main() -> int:
    processes: list[subprocess.Popen] = []
    stop_signal: int | None = None

    def request_stop(signum: int, frame: FrameType | None) -> None:
        nonlocal stop_signal
        # Do not raise between Popen and append: every launched child must be
        # registered before cleanup, including Ctrl+C during startup.
        stop_signal = signum

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, request_stop)
    try:
        for name, command in COMMANDS:
            if stop_signal is not None:
                break
            print(f"[dev] Starting {name}", flush=True)
            processes.append(
                subprocess.Popen(
                    command, start_new_session=True, stdin=subprocess.DEVNULL
                )
            )
        print(
            "[dev] Ctrl+C stops backend, bot and Mini App; PostgreSQL stays running.",
            flush=True,
        )
        while stop_signal is None:
            for (name, _), process in zip(COMMANDS, processes):
                code = process.poll()
                if code is not None:
                    print(
                        f"[dev] {name} exited ({code}); stopping the other services.",
                        flush=True,
                    )
                    return 1
            time.sleep(0.2)
        return 128 + stop_signal
    except OSError as exc:
        print(f"[dev] Could not start services: {exc}", flush=True)
        return 1
    finally:
        stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
