import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from hosted.accounts import Accounts, save_account


class AccountsTests(unittest.TestCase):
    def test_files_are_private_and_native_session_is_not_the_bearer(self):
        with tempfile.TemporaryDirectory() as root:
            path = save_account(Path(root), "one", "bearer", {"auth_token": "native"})
            accounts = Accounts(Path(root))
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertNotIn("bearer", path.read_text())
            self.assertIsNone(accounts.authenticate("native"))
            self.assertIsNotNone(accounts.authenticate("bearer"))

    def test_revocation_racing_a_registry_read_is_unauthorized(self):
        with tempfile.TemporaryDirectory() as root:
            save_account(Path(root), "one", "bearer", {})
            accounts = Accounts(Path(root))
            account = accounts.authenticate("bearer")
            with patch.object(Path, "read_bytes", side_effect=FileNotFoundError):
                self.assertIsNone(accounts.authenticate("bearer"))
                self.assertFalse(accounts.current(account))
