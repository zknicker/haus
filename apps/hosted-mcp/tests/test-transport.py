import asyncio
import tempfile
import sys
import unittest
from pathlib import Path

from httpx2 import ASGITransport, AsyncClient

from hosted.accounts import save_account
from hosted.server import create_app


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        save_account(root, "one", "test-token", {})
        save_account(root, "two", "other-token", {})
        self.app, self.pool = create_app(
            root, command=(sys.executable, str(Path("tests/fixture-worker.py").resolve())),
            control_token="control-secret")
        self.stop = asyncio.Event()
        ready = asyncio.Event()

        async def lifespan():
            async with self.app.app.router.lifespan_context(self.app.app):
                ready.set()
                await self.stop.wait()

        self.lifespan_task = asyncio.create_task(lifespan())
        await ready.wait()
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url="http://127.0.0.1:1")
        self.headers = {"Authorization": "Bearer test-token", "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream"}

    async def asyncTearDown(self):
        await self.client.aclose()
        self.stop.set()
        await self.lifespan_task
        self.temp.cleanup()

    async def rpc(self, method, params=None, **kwargs):
        return await self.client.post("/mcp", headers=self.headers,
                                      json={"jsonrpc": "2.0", "id": 1, "method": method,
                                            "params": params or {}}, **kwargs)

    async def test_auth_required_for_discovery_and_status(self):
        for path in ("/mcp", "/status"):
            for header in ({}, {"Authorization": "Bearer invalid"}):
                response = await self.client.get(path, headers=header)
                self.assertEqual(response.status_code, 401)
        self.assertEqual((await self.client.get("/healthz")).status_code, 200)

    async def test_only_server_control_token_can_provision_and_revoke_accounts(self):
        payload = {"key": "desktop-account", "session": {"auth_token": "native", "waf_token": "waf", "cookie_header": "auth_token=native"}}
        response = await self.client.post("/accounts", json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 401)
        control = {"Authorization": "Bearer control-secret"}
        response = await self.client.post("/accounts", json=payload, headers=control)
        self.assertEqual(response.status_code, 200, response.text)
        bearer = response.json()["bearerToken"]
        self.assertNotIn("native", response.text)
        user = {"Authorization": "Bearer " + bearer}
        self.assertEqual((await self.client.get("/status", headers=user)).status_code, 200)
        self.assertEqual((await self.client.delete("/accounts/desktop-account", headers=user)).status_code, 401)
        self.assertEqual((await self.client.delete("/accounts/desktop-account", headers=control)).status_code, 200)
        self.assertEqual((await self.client.get("/status", headers=user)).status_code, 401)

    async def test_provisioning_rejects_header_injection_and_large_sessions(self):
        control = {"Authorization": "Bearer control-secret"}
        response = await self.client.post("/accounts", headers=control, json={"key": "bad", "session": {"auth_token": "x\n", "waf_token": "waf", "cookie_header": "auth_token=x"}})
        self.assertEqual(response.status_code, 400)
        response = await self.client.post("/accounts", headers=control, content=b"x" * 70_000)
        self.assertEqual(response.status_code, 413)

    async def test_canceled_provisioning_removes_native_session(self):
        entered = asyncio.Event()

        async def wait_for_verification(*args):
            entered.set()
            await asyncio.Event().wait()

        self.pool.call = wait_for_verification
        pending = asyncio.create_task(self.client.post(
            "/accounts", headers={"Authorization": "Bearer control-secret"},
            json={"key": "canceled", "session": {"auth_token": "native", "waf_token": "waf", "cookie_header": "auth_token=native"}}))
        await asyncio.wait_for(entered.wait(), timeout=2)
        pending.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await pending
        self.assertFalse((Path(self.temp.name) / "canceled.json").exists())

    async def test_discovery_does_not_spawn_workers(self):
        response = await self.rpc("initialize", {"protocolVersion": "2025-11-25",
                                                 "capabilities": {},
                                                 "clientInfo": {"name": "test", "version": "1"}})
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.rpc("tools/list")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["result"]["tools"]), 9)
        self.assertEqual(self.pool.stats()["starts"], 0)

    async def test_invalid_tool_arguments_do_not_spawn_workers(self):
        response = await self.rpc("tools/call", {"name": "skool_list_posts",
                                                "arguments": {"community_slug": "foreign", "raw": True}})
        payload = response.json()
        self.assertTrue("error" in payload or payload["result"]["isError"])
        self.assertEqual(self.pool.stats()["starts"], 0)

    async def test_oversized_request_rejected(self):
        response = await self.rpc("tools/call", {"name": "skool_search_posts",
                                                "arguments": {"query": "x" * 70_000}})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.pool.stats()["starts"], 0)

    async def test_concurrent_http_requests_keep_account_context(self):
        async def call(token):
            headers = {**self.headers, "Authorization": f"Bearer {token}"}
            response = await self.client.post("/mcp", headers=headers, json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": "skool_list_communities", "arguments": {}}})
            payload = response.json()["result"]
            self.assertFalse(payload.get("isError", False), payload)
            import json
            return json.loads(payload["content"][0]["text"])["account"]

        communities = await asyncio.gather(call("test-token"), call("other-token"))
        self.assertEqual(communities, ["one", "two"])
