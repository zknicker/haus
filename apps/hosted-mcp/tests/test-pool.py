import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

from hosted.accounts import Accounts, save_account
from hosted.pool import Pool, Unavailable


class PoolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.accounts = Accounts(self.root)
        for name in ("first", "second", "third"):
            save_account(self.root, name, name, {})
        self.first = self.accounts.authenticate("first")
        self.second = self.accounts.authenticate("second")
        self.third = self.accounts.authenticate("third")
        self.pool = Pool(self.accounts, capacity=2, idle_seconds=.04, timeout_seconds=.5,
                         command=(sys.executable, str(Path("tests/fixture-worker.py").resolve())))

    async def asyncTearDown(self):
        await self.pool.close()
        self.temp.cleanup()

    async def test_accounts_reuse_only_their_own_process(self):
        self.pool.idle_seconds = 90
        one = (await self.pool.call(self.first, "fake", {}))["result"]
        two = (await self.pool.call(self.second, "fake", {}))["result"]
        again = (await self.pool.call(self.first, "fake", {}))["result"]
        self.assertEqual(one["account"], "first")
        self.assertEqual(two["account"], "second")
        self.assertNotEqual(one["pid"], two["pid"])
        self.assertEqual(one["pid"], again["pid"])
        self.assertEqual(again["counter"], 2)

    async def test_concurrent_capacity_and_same_account_busy(self):
        first = asyncio.create_task(self.pool.call(self.first, "fake", {"delay": .2}))
        second = asyncio.create_task(self.pool.call(self.second, "fake", {"delay": .2}))
        await asyncio.sleep(.05)
        with self.assertRaises(Unavailable):
            await self.pool.call(self.third, "fake", {})
        with self.assertRaises(Unavailable):
            await self.pool.call(self.first, "fake", {})
        self.assertEqual(self.pool.stats()["workers"], 2)
        await asyncio.gather(first, second)

    async def test_idle_eviction_and_shutdown(self):
        await self.pool.call(self.first, "fake", {})
        await asyncio.sleep(.05)
        await self.pool.sweep()
        self.assertEqual(self.pool.stats()["workers"], 0)
        await self.pool.close()
        with self.assertRaises(Unavailable):
            await self.pool.call(self.first, "fake", {})

    async def test_idle_worker_replaced_at_capacity(self):
        self.pool.capacity = 1
        self.pool.idle_seconds = 90
        await self.pool.call(self.first, "fake", {})
        reply = await self.pool.call(self.second, "fake", {})
        self.assertEqual(reply["result"]["account"], "second")
        self.assertEqual(self.pool.stats()["workers"], 1)

    async def test_revocation_terminates_worker_and_rejects_stale_identity(self):
        await self.pool.call(self.first, "fake", {})
        self.first.path.unlink()
        await self.pool.sweep()
        self.assertEqual(self.pool.stats()["workers"], 0)
        with self.assertRaises(Unavailable):
            await self.pool.call(self.first, "fake", {})

    async def test_timeout_reaps_process_group(self):
        child_file = self.root / "child-pid"
        with self.assertRaises(TimeoutError):
            await self.pool.call(self.first, "fake", {"delay": 2, "child_file": str(child_file)})
        self.assertEqual(self.pool.stats()["workers"], 0)
        child = int(child_file.read_text())
        for _ in range(20):
            try:
                os.kill(child, 0)
            except ProcessLookupError:
                break
            await asyncio.sleep(.01)
        else:
            self.fail("Worker child survived timeout")

    async def test_cancel_reaps_worker(self):
        pending = asyncio.create_task(self.pool.call(self.first, "fake", {"delay": 2}))
        await asyncio.sleep(.05)
        pending.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await pending
        self.assertEqual(self.pool.stats()["workers"], 0)

    async def test_oversized_worker_response_reaps_worker(self):
        with self.assertRaises((ValueError, Unavailable)):
            await self.pool.call(self.first, "fake", {"oversized": True})
        self.assertEqual(self.pool.stats()["workers"], 0)

    async def test_revocation_during_read_discards_private_result(self):
        pending = asyncio.create_task(self.pool.call(self.first, "fake", {"delay": .1}))
        await asyncio.sleep(.05)
        self.first.path.unlink()
        with self.assertRaises(Unavailable):
            await pending
        self.assertEqual(self.pool.stats()["workers"], 0)
