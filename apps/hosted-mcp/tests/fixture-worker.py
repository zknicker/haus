import json
import os
import subprocess
import sys
import time
from pathlib import Path

with open(sys.argv[1]) as source:
    account = json.load(source)
counter = 0
for line in sys.stdin:
    request = json.loads(line)
    args = request["arguments"]
    if args.get("child_file"):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(90)"])
        with open(args["child_file"], "w") as target:
            target.write(str(child.pid))
    time.sleep(args.get("delay", 0))
    if args.get("oversized"):
        print("x" * 1_100_000, flush=True)
        continue
    counter += 1
    print(json.dumps({"result": {"account": Path(sys.argv[1]).stem, "pid": os.getpid(),
                                  "counter": counter}}), flush=True)
