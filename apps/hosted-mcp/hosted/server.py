"""Authenticated, stateless Streamable HTTP transport. No account workers on discovery."""

import asyncio
import contextlib
import contextvars
import json
import hmac
from pathlib import Path

from mcp.server.lowlevel import Server
from mcp.types import CallToolResult, ListToolsResult, TextContent
from starlette.responses import JSONResponse
from starlette.routing import Route

from hosted.accounts import Account, Accounts
from hosted.catalog import BY_NAME, TOOLS, validate
from hosted.pool import Pool, Unavailable
from hosted.provision import routes

CURRENT: contextvars.ContextVar[Account] = contextvars.ContextVar("account")


def create_app(root: Path, capacity: int = 2, idle_seconds: float = 60,
               timeout_seconds: float = 25, command: tuple[str, ...] | None = None,
               control_token: str | None = None):
    accounts = Accounts(root)
    pool = Pool(accounts, capacity, idle_seconds, timeout_seconds, command)
    provision, revoke = routes(accounts, pool)

    async def list_tools(context, params):
        return ListToolsResult(tools=TOOLS)

    async def call_tool(context, params):
        try:
            validate(params.name, params.arguments or {})
            response = await pool.call(CURRENT.get(), params.name, params.arguments or {})
        except asyncio.CancelledError:
            raise
        except TimeoutError:
            response = {"error": "Skool read timed out; retry shortly"}
        except Unavailable as error:
            response = {"error": str(error)}
        except Exception:
            response = {"error": "Invalid request or worker failure"}
        failed = "error" in response
        payload = response if failed else response["result"]
        return CallToolResult(content=[TextContent(type="text", text=json.dumps(payload))],
                              isError=failed)

    async def health(request):
        return JSONResponse({"status": "ok"})

    async def status(request):
        return JSONResponse(pool.stats())

    server = Server("haus-skool", version="0.1.0", on_list_tools=list_tools,
                    on_call_tool=call_tool,
                    get_tool_input_schema=lambda name: BY_NAME[name].input_schema if name in BY_NAME else None)
    app = server.streamable_http_app(
        json_response=True, stateless_http=True, max_request_body_size=65_536,
        custom_starlette_routes=[Route("/healthz", health), Route("/status", status),
                                Route("/accounts", provision, methods=["POST"]),
                                Route("/accounts/{key}", revoke, methods=["DELETE"])])
    original_lifespan = app.router.lifespan_context

    @contextlib.asynccontextmanager
    async def lifespan(application):
        async def reap():
            while True:
                await asyncio.sleep(min(idle_seconds, 5))
                await pool.sweep()

        async with original_lifespan(application):
            reaper = asyncio.create_task(reap())
            try:
                yield
            finally:
                reaper.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await reaper
                await pool.close()

    app.router.lifespan_context = lifespan
    return Auth(app, accounts, control_token), pool


class Auth:
    def __init__(self, app, accounts: Accounts, control_token: str | None = None):
        self.app = app
        self.accounts = accounts
        self.control_token = control_token

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] == "/healthz":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        authorization = headers.get(b"authorization", b"").decode("latin1")
        if scope["path"] == "/accounts" or scope["path"].startswith("/accounts/"):
            if not self.control_token or not hmac.compare_digest(authorization, "Bearer " + self.control_token):
                return await JSONResponse({"error": "Unauthorized"}, status_code=401)(scope, receive, send)
            return await self.app(scope, receive, send)
        account = None
        if authorization.startswith("Bearer ") and len(authorization) <= 512:
            account = self.accounts.authenticate(authorization[7:])
        if account is None:
            return await JSONResponse({"error": "Unauthorized"}, status_code=401)(scope, receive, send)
        token = CURRENT.set(account)
        try:
            await self.app(scope, receive, send)
        finally:
            CURRENT.reset(token)
