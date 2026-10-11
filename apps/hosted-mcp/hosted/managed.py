"""Private Server-owned transport. Configuration arrives only through stdin."""

import asyncio
import json
import os
import sys
from pathlib import Path

import uvicorn

from hosted.server import create_app


async def run():
    config = json.loads(sys.stdin.readline())
    root = Path(config["root"])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    app, _ = create_app(root / "accounts", control_token=config["control_token"])
    server = uvicorn.Server(uvicorn.Config(
        app, uds=config["socket"], access_log=False, log_config=None,
        log_level="critical", lifespan="on"))
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    transport, _ = await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    async def parent_closed():
        await reader.read()
        server.should_exit = True

    watcher = asyncio.create_task(parent_closed())
    try:
        await server.serve()
    finally:
        watcher.cancel()
        transport.close()


if __name__ == "__main__":
    os.umask(0o077)
    asyncio.run(run())
