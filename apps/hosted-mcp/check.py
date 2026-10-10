"""Run the deterministic Python contract suite without a second test framework."""

import importlib.util
import logging
import unittest
from pathlib import Path

suite = unittest.TestSuite()
logging.basicConfig(level=logging.WARNING, force=True)
for path in sorted(Path("tests").glob("test-*.py")):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(not result.wasSuccessful())
