"""Local credential storage. Never send native session credentials to clients."""

import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Account:
    key: str
    path: Path
    revision: str


class Accounts:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def authenticate(self, token: str) -> Account | None:
        digest = hashlib.sha256(token.encode()).hexdigest()
        for path in self.root.glob("*.json"):
            try:
                payload = path.read_bytes()
            except FileNotFoundError:
                continue
            record = json.loads(payload)
            if hmac.compare_digest(record["token_hash"], digest):
                return Account(path.stem, path,
                               hashlib.sha256(payload).hexdigest())
        return None

    def current(self, account: Account) -> bool:
        try:
            payload = account.path.read_bytes()
        except FileNotFoundError:
            return False
        return hashlib.sha256(payload).hexdigest() == account.revision


def save_account(root: Path, key: str, token: str, session: dict) -> Path:
    if not re.fullmatch(r"[a-z0-9-]{1,80}", key):
        raise ValueError("Account key must use lowercase letters, digits and hyphens")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = root / f"{key}.json"
    record = {"token_hash": hashlib.sha256(token.encode()).hexdigest(),
              "session": session}
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(record, output)
    return path
