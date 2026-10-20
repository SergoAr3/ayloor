"""Local development only: print a signed initData for a synthetic test user."""

import argparse
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    load_dotenv(ROOT / ".env")
    if os.environ.get("ENVIRONMENT") != "development":
        raise SystemExit(
            "This CLI requires ENVIRONMENT=development. Never use it against production."
        )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "telegram_id", type=int, help="Synthetic positive ID; avoid real account IDs"
    )
    args = parser.parse_args()
    if not 0 < args.telegram_id < 2**63:
        raise SystemExit("Use a positive 64-bit user ID")
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN in your local .env")
    data = {
        "auth_date": str(int(time.time())),
        "user": json.dumps(
            {"id": args.telegram_id, "first_name": "Local Player"},
            separators=(",", ":"),
        ),
    }
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    check = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    print(urlencode(data))


if __name__ == "__main__":
    main()
