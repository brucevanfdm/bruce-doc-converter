import json
import subprocess
import sys
import unittest


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-m", "bruce_doc_converter.cli", *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def test_help_outputs_json(self):
        result = self.run_cli("--help-json")

        self.assertEqual(0, result.returncode, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["success"])
        self.assertEqual("1.0", payload["schema_version"])
        self.assertIn("convert", payload["commands"])
        self.assertIn("batch", payload["commands"])

    def test_missing_command_outputs_json_failure(self):
        result = self.run_cli()

        self.assertEqual(1, result.returncode)
        payload = json.loads(result.stdout)
        self.assertFalse(payload["success"])
        self.assertEqual("USAGE_ERROR", payload["error_code"])
