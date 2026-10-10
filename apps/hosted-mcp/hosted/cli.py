"""Local operator commands. Provision credentials through files, not shell arguments."""

import argparse
import dataclasses
import json
import os
import re
import secrets
from pathlib import Path

from hosted.accounts import save_account

ROOT = Path.home() / ".local/share/haus-hosted-mcp"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve")
    serve.add_argument("--port", type=int, required=True)
    serve.add_argument("--workers", type=int, default=2)
    serve.add_argument("--idle-seconds", type=float, default=60)
    login = commands.add_parser("login")
    login.add_argument("--key", required=True)
    login.add_argument("--profile", type=Path, required=True)
    login.add_argument("--headless", action="store_true")
    login.add_argument("--port", type=int, required=True)
    revoke = commands.add_parser("revoke")
    revoke.add_argument("--key", required=True)
    for command in (serve, login, revoke):
        command.add_argument("--root", type=Path, default=ROOT)
    options = parser.parse_args()
    root = options.root.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if options.command == "serve":
        import uvicorn
        from hosted.server import create_app
        from hosted.provision import control_token

        app, _ = create_app(root / "accounts", options.workers, options.idle_seconds,
                            control_token=control_token(root))
        uvicorn.run(app, host="127.0.0.1", port=options.port, access_log=False)
    elif options.command == "login":
        provision(root, options)
    elif options.command == "revoke":
        if not re.fullmatch(r"[a-z0-9-]{1,80}", options.key):
            parser.error("Invalid account key")
        (root / "accounts" / f"{options.key}.json").unlink(missing_ok=True)
        (root / f"{options.key}-connection.json").unlink(missing_ok=True)
        print("Revoked. Active workers terminate within five seconds.")


def provision(root: Path, options) -> None:
    from catknows import login

    if not re.fullmatch(r"[a-z0-9-]{1,80}", options.key):
        raise ValueError("Invalid account key")
    account_path = root / "accounts" / f"{options.key}.json"
    credential_path = root / f"{options.key}-connection.json"
    if account_path.exists() or credential_path.exists():
        raise ValueError("Account exists; revoke before reconnecting")
    session = login(profile_dir=options.profile, headless=options.headless, timeout_ms=180_000)
    if not session.is_valid:
        raise ValueError("Skool login did not complete")
    token = secrets.token_urlsafe(32)
    save_account(root / "accounts", options.key, token, dataclasses.asdict(session))
    try:
        descriptor = os.open(credential_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump({"url": f"http://127.0.0.1:{options.port}/mcp",
                       "headers": {"Authorization": f"Bearer {token}"}}, output)
    except OSError:
        account_path.unlink()
        raise
    print(f"Saved connection credentials to {credential_path}. Treat this file as a secret.")


if __name__ == "__main__":
    main()
