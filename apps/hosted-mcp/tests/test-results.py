import json
import unittest

from mcp.types import CallToolResult, TextContent

from hosted.worker import encode_response


class ResultTests(unittest.TestCase):
    def test_text_escaping_stays_below_computer_result_limit(self):
        result = '"' * 190_000
        response = json.loads(encode_response(result))
        self.assertIn("result", response)
        wire_result = CallToolResult(content=[TextContent(type="text", text=json.dumps(response["result"]))])
        self.assertLess(len(wire_result.model_dump_json().encode()), 1_048_576)

    def test_large_results_return_an_actionable_error(self):
        response = json.loads(encode_response('"' * 210_000))
        self.assertNotIn("result", response)
        self.assertIn("fewer posts", response["error"])
