"""Private JSON-lines protocol. Stdout carries results, never library diagnostics."""

import contextlib
import json
import sys

from hosted.catalog import validate
from hosted.skool import Skool

# MCP wraps this JSON in a text block, escaping it a second time on the wire.
MAX_BYTES = 400_000


def main() -> None:
    with open(sys.argv[1]) as source:
        record = json.load(source)
    with contextlib.redirect_stdout(sys.stderr):
        skool = Skool(record)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            validate(request["name"], request["arguments"])
            with contextlib.redirect_stdout(sys.stderr):
                result = skool.call(request["name"], request["arguments"])
            response = encode_response(result)
        except Exception:
            response = json.dumps({"error": "Skool read failed. Verify access or reconnect the account."})
        print(response, flush=True)


def encode_response(result) -> str:
    encoded = json.dumps({"result": result})
    if len(encoded.encode()) > MAX_BYTES:
        return json.dumps({"error": "Result too large; request fewer posts or a smaller course."})
    return encoded


if __name__ == "__main__":
    main()
