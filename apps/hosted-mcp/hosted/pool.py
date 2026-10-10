"""A bounded, queue-free pool. Busy callers retry rather than accumulating work."""

import asyncio
import json
import os
import signal
import sys
import time
from dataclasses import dataclass

from hosted.accounts import Account, Accounts


class Unavailable(Exception):
    pass


@dataclass
class Worker:
    account: Account
    process: asyncio.subprocess.Process
    busy: bool = False
    touched: float = 0


class Pool:
    def __init__(self, accounts: Accounts, capacity: int = 2, idle_seconds: float = 60,
                 timeout_seconds: float = 25, command: tuple[str, ...] | None = None):
        if capacity < 1 or idle_seconds <= 0 or timeout_seconds <= 0:
            raise ValueError("Pool limits must be positive")
        self.accounts = accounts
        self.capacity = capacity
        self.idle_seconds = idle_seconds
        self.timeout_seconds = timeout_seconds
        self.command = command or (sys.executable, "-m", "hosted.worker")
        self.workers: dict[str, Worker] = {}
        self.lock = asyncio.Lock()
        self.closed = False
        self.calls = 0
        self.starts = 0

    async def call(self, account: Account, name: str, arguments: dict):
        async with self.lock:
            if self.closed or not self.accounts.current(account):
                raise Unavailable("Account disconnected")
            await self._sweep()
            worker = self.workers.get(account.key)
            if worker and worker.busy:
                raise Unavailable("Account busy; retry shortly")
            if not worker:
                if len(self.workers) >= self.capacity:
                    idle = [entry for entry in self.workers.values() if not entry.busy]
                    if not idle:
                        raise Unavailable("Worker capacity reached; retry shortly")
                    await self._remove(min(idle, key=lambda entry: entry.touched))
                process = await asyncio.create_subprocess_exec(
                    *self.command, str(account.path), stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                    start_new_session=True, limit=500_000)
                worker = Worker(account, process)
                self.workers[account.key] = worker
                self.starts += 1
            worker.busy = True
            self.calls += 1
        try:
            async with asyncio.timeout(self.timeout_seconds):
                worker.process.stdin.write(json.dumps({"name": name, "arguments": arguments}).encode() + b"\n")
                await worker.process.stdin.drain()
                line = await worker.process.stdout.readline()
                if not line or len(line) > 450_000:
                    raise Unavailable("Worker response unavailable")
                response = json.loads(line)
                if not self.accounts.current(account):
                    raise Unavailable("Account disconnected")
                return response
        except BaseException:
            # Reap before freeing capacity, including client cancellations.
            async with self.lock:
                await self._remove(worker)
            raise
        finally:
            worker.busy = False
            worker.touched = time.monotonic()

    async def sweep(self) -> None:
        async with self.lock:
            await self._sweep()

    async def close(self) -> None:
        async with self.lock:
            self.closed = True
            for worker in list(self.workers.values()):
                await self._remove(worker)

    def stats(self) -> dict:
        return {"workers": len(self.workers), "busy": sum(w.busy for w in self.workers.values()),
                "capacity": self.capacity, "calls": self.calls, "starts": self.starts}

    async def _sweep(self) -> None:
        now = time.monotonic()
        for worker in list(self.workers.values()):
            if (not self.accounts.current(worker.account) or worker.process.returncode is not None
                    or (not worker.busy and now - worker.touched >= self.idle_seconds)):
                await self._remove(worker)

    async def _remove(self, worker: Worker) -> None:
        try:
            os.killpg(worker.process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await worker.process.wait()
        if self.workers.get(worker.account.key) is worker:
            del self.workers[worker.account.key]
