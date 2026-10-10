"""Server-only account provisioning. Native sessions never appear in responses."""

import asyncio
import json
import re
import secrets
from pathlib import Path

from starlette.responses import JSONResponse

from hosted.accounts import save_account


def control_token(root: Path) -> str:
    path = root / "control-token"
    try:
        return path.read_text().strip()
    except FileNotFoundError:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        import os
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        token = secrets.token_urlsafe(32)
        with os.fdopen(descriptor, "w") as output:
            output.write(token)
        return token


def routes(accounts, pool):
    async def provision(request):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65_536:
                return JSONResponse({"error": "Request too large"}, status_code=413)
        try:
            payload = json.loads(body)
            key = payload["key"]
            session = payload["session"]
            if not re.fullmatch(r"[a-z0-9-]{1,80}", key):
                raise ValueError()
            if set(session) != {"auth_token", "cookie_header", "waf_token"}:
                raise ValueError()
            for value in session.values():
                if not isinstance(value, str) or not value or len(value) > 32_000 or not value.isascii() or any(ord(c) < 32 for c in value):
                    raise ValueError()
        except (ValueError, KeyError, TypeError):
            return JSONResponse({"error": "Invalid session"}, status_code=400)
        bearer = secrets.token_urlsafe(32)
        try:
            path = save_account(accounts.root, key, bearer, session)
        except FileExistsError:
            return JSONResponse({"error": "Account already exists"}, status_code=409)
        try:
            account = accounts.authenticate(bearer)
            result = await pool.call(account, "skool_list_communities", {})
            if "error" in result:
                raise ValueError()
        except asyncio.CancelledError:
            path.unlink(missing_ok=True)
            await pool.sweep()
            raise
        except Exception:
            path.unlink(missing_ok=True)
            await pool.sweep()
            return JSONResponse({"error": "Skool sign-in could not be verified. Try again."}, status_code=401)
        return JSONResponse({"bearerToken": bearer})

    async def revoke(request):
        key = request.path_params["key"]
        if not re.fullmatch(r"[a-z0-9-]{1,80}", key):
            return JSONResponse({"error": "Invalid account"}, status_code=400)
        (accounts.root / f"{key}.json").unlink(missing_ok=True)
        await pool.sweep()
        return JSONResponse({"revoked": True})

    return provision, revoke
