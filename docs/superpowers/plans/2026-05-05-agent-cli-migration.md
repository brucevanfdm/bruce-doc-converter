# Agent CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing skill-local document converter into a Python-distributed, agent-facing CLI while preserving both conversion directions.

**Architecture:** Python remains the orchestration layer and exposes the console commands `bdc` and `bruce-doc-converter`. The existing Node.js Markdown-to-DOCX implementation remains a bundled subprocess dependency used only for `.md -> .docx`.

**Tech Stack:** Python 3.8+, `argparse`, setuptools console scripts via `pyproject.toml`, existing Node.js CommonJS converter under `scripts/md_to_docx`, Python `unittest`, Node `node:test`.

---

## Decisions

- Primary distribution: Python package, published as `bruce-doc-converter` if the PyPI name is available.
- Console commands: `bdc` as the short command and `bruce-doc-converter` as the readable alias.
- Output protocol: JSON by default for every command. Progress and dependency installation logs must stay on stderr.
- Compatibility scripts: delete `convert.sh`, `convert.ps1`, and `convert.bat` in v1 of this migration.
- Node module: keep the current Node.js Markdown-to-DOCX implementation. Do not rewrite it in Python.

## File Structure

- Create `pyproject.toml`: package metadata, Python version, dependencies, package data, console script entry points.
- Create `bruce_doc_converter/__init__.py`: version export.
- Create `bruce_doc_converter/converter.py`: package-local copy of the current conversion implementation, refactored only enough to run from an installed wheel.
- Create `bruce_doc_converter/cli.py`: agent-facing CLI argument parsing and JSON envelope normalization.
- Move `scripts/md_to_docx/*` to `bruce_doc_converter/md_to_docx/*`: bundled Node subprocess module and its `package.json`.
- Modify `tests/test_convert_document.py`: import from `bruce_doc_converter.converter`.
- Modify `tests/md_to_docx.test.js`: import from `bruce_doc_converter/md_to_docx`.
- Create `tests/test_cli.py`: subprocess-level tests for `bdc` behavior via `python -m bruce_doc_converter.cli`.
- Modify `SKILL.md`: reduce to trigger conditions, `bdc` invocation, JSON parsing rules, and installation fallback.
- Modify `README.md` and `README.en.md`: document pip install, CLI commands, JSON default, and removal of legacy scripts.
- Delete `convert.sh`, `convert.ps1`, `convert.bat`.
- Keep `requirements.txt` for local development only, or replace it with a short pointer to `pyproject.toml` if desired.

## JSON Protocol v1

Single-file success:

```json
{
  "schema_version": "1.0",
  "success": true,
  "input_path": "/absolute/input.docx",
  "input_format": "docx",
  "output_format": "markdown",
  "output_path": "/absolute/Markdown/input.md",
  "markdown_content": "# content",
  "extracted_images": [],
  "warnings": []
}
```

Single-file failure:

```json
{
  "schema_version": "1.0",
  "success": false,
  "input_path": "/absolute/input.doc",
  "input_format": "doc",
  "error_code": "UNSUPPORTED_FORMAT",
  "error": "不支持的文件格式: .doc。支持的格式: .docx, .xlsx, .pptx, .pdf, .md",
  "suggestion": "请先转换为 .docx/.xlsx/.pptx 后再重试。"
}
```

Batch result:

```json
{
  "schema_version": "1.0",
  "success": false,
  "total": 2,
  "succeeded": 1,
  "failed": 1,
  "results": [
    {
      "file": "/absolute/a.docx",
      "result": {
        "schema_version": "1.0",
        "success": true,
        "input_path": "/absolute/a.docx",
        "input_format": "docx",
        "output_format": "markdown",
        "output_path": "/absolute/Markdown/a.md",
        "markdown_content": "# content",
        "extracted_images": [],
        "warnings": []
      }
    }
  ]
}
```

## Error Codes

- `FILE_NOT_FOUND`: input file or directory does not exist.
- `NOT_A_FILE`: single-file input path is not a file.
- `NOT_A_DIRECTORY`: batch input path or output path is not a directory.
- `FILE_TOO_LARGE`: input exceeds `MAX_FILE_SIZE_BYTES`.
- `UNSUPPORTED_FORMAT`: extension is not one of `.docx`, `.xlsx`, `.pptx`, `.pdf`, `.md`.
- `DEPENDENCY_INSTALL_FAILED`: Python or Node dependency installation failed.
- `NODE_NOT_FOUND`: `.md -> .docx` requested but Node.js is missing.
- `NODE_CONVERSION_FAILED`: Node subprocess returned invalid output or failure.
- `CONVERSION_TIMEOUT`: Node subprocess exceeded timeout.
- `EMPTY_PDF_CONTENT`: PDF produced no extractable text or tables.
- `PERMISSION_DENIED`: read or write permission failure.
- `OUT_OF_MEMORY`: conversion hit `MemoryError`.
- `OS_ERROR`: filesystem or OS error.
- `CONVERSION_ERROR`: unknown conversion exception.

---

### Task 1: Add Package Metadata and CLI Skeleton

**Files:**
- Create: `pyproject.toml`
- Create: `bruce_doc_converter/__init__.py`
- Create: `bruce_doc_converter/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing CLI import and help tests**

Create `tests/test_cli.py`:

```python
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
python -m unittest tests.test_cli -v
```

Expected: import fails because `bruce_doc_converter.cli` does not exist.

- [ ] **Step 3: Add `pyproject.toml`**

Create `pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "bruce-doc-converter"
version = "0.1.0"
description = "Agent-facing document converter CLI for Office/PDF/Markdown workflows"
readme = "README.md"
requires-python = ">=3.8"
license = { text = "MIT" }
authors = [{ name = "Bruce" }]
dependencies = [
  "python-docx",
  "openpyxl",
  "python-pptx",
  "pdfplumber"
]

[project.scripts]
bdc = "bruce_doc_converter.cli:main"
bruce-doc-converter = "bruce_doc_converter.cli:main"

[tool.setuptools.packages.find]
include = ["bruce_doc_converter*"]

[tool.setuptools.package-data]
bruce_doc_converter = [
  "md_to_docx/*.js",
  "md_to_docx/package.json",
  "md_to_docx/package-lock.json"
]
```

- [ ] **Step 4: Add package init**

Create `bruce_doc_converter/__init__.py`:

```python
"""Agent-facing document converter CLI."""

__version__ = "0.1.0"
```

- [ ] **Step 5: Add minimal CLI skeleton**

Create `bruce_doc_converter/cli.py`:

```python
import json
import sys

SCHEMA_VERSION = "1.0"


def _emit(payload, exit_code):
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return exit_code


def _usage_error(message):
    return {
        "schema_version": SCHEMA_VERSION,
        "success": False,
        "error_code": "USAGE_ERROR",
        "error": message,
    }


def _help_payload():
    return {
        "schema_version": SCHEMA_VERSION,
        "success": True,
        "commands": {
            "convert": "Convert one .docx/.xlsx/.pptx/.pdf file to Markdown, or one .md file to DOCX.",
            "batch": "Convert supported files in a directory.",
        },
    }


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if args == ["--help-json"]:
        return _emit(_help_payload(), 0)
    if not args:
        return _emit(_usage_error("缺少命令。可用命令: convert, batch"), 1)
    return _emit(_usage_error(f"未知命令: {args[0]}"), 1)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Run CLI tests**

Run:

```bash
python -m unittest tests.test_cli -v
```

Expected: both tests pass.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml bruce_doc_converter/__init__.py bruce_doc_converter/cli.py tests/test_cli.py
git commit -m "feat: add agent CLI package skeleton"
```

---

### Task 2: Move Python Converter Into Package

**Files:**
- Create: `bruce_doc_converter/converter.py`
- Modify: `tests/test_convert_document.py`
- Delete later: `scripts/convert_document.py`

- [ ] **Step 1: Write failing import update**

Change the import block in `tests/test_convert_document.py` from:

```python
from scripts.convert_document import (
```

to:

```python
from bruce_doc_converter.converter import (
```

- [ ] **Step 2: Run the failing converter tests**

Run:

```bash
python -m unittest tests.test_convert_document.ConvertDocumentTests.test_convert_xlsx_keeps_merged_cells_as_single_value -v
```

Expected: fails because `bruce_doc_converter.converter` does not exist.

- [ ] **Step 3: Copy converter implementation into package**

Create `bruce_doc_converter/converter.py` by copying the full current contents of `scripts/convert_document.py`.

Then change the Node script path resolution inside `convert_md` from:

```python
script_dir = os.path.dirname(os.path.abspath(__file__))
node_script = os.path.join(script_dir, 'md_to_docx', 'index.js')
```

to:

```python
script_dir = os.path.dirname(os.path.abspath(__file__))
node_script = os.path.join(script_dir, 'md_to_docx', 'index.js')
```

This expression remains the same after the move because `md_to_docx` will be moved under `bruce_doc_converter/` in Task 3.

- [ ] **Step 4: Keep converter `main()` temporarily**

Leave `main()` in `bruce_doc_converter/converter.py` for this task. It will be removed or made private after `cli.py` owns command parsing.

- [ ] **Step 5: Run focused converter test**

Run:

```bash
python -m unittest tests.test_convert_document.ConvertDocumentTests.test_convert_xlsx_keeps_merged_cells_as_single_value -v
```

Expected: pass.

- [ ] **Step 6: Run all Python converter tests**

Run:

```bash
python -m unittest tests.test_convert_document -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add bruce_doc_converter/converter.py tests/test_convert_document.py
git commit -m "refactor: move converter into Python package"
```

---

### Task 3: Move Node Markdown-to-DOCX Module Into Package Data

**Files:**
- Move: `scripts/md_to_docx/*` to `bruce_doc_converter/md_to_docx/*`
- Modify: `tests/md_to_docx.test.js`

- [ ] **Step 1: Move Node module files**

Run:

```bash
mkdir -p bruce_doc_converter/md_to_docx
mv scripts/md_to_docx/* bruce_doc_converter/md_to_docx/
rmdir scripts/md_to_docx
```

- [ ] **Step 2: Update Node tests imports**

Change `tests/md_to_docx.test.js` from:

```javascript
const { markdownToHTML } = require('../scripts/md_to_docx/markdown-converter');
const { convertHTMLToDocx } = require('../scripts/md_to_docx/html-converter');
```

to:

```javascript
const { markdownToHTML } = require('../bruce_doc_converter/md_to_docx/markdown-converter');
const { convertHTMLToDocx } = require('../bruce_doc_converter/md_to_docx/html-converter');
```

- [ ] **Step 3: Update package test script**

Change `bruce_doc_converter/md_to_docx/package.json`:

```json
{
  "name": "md-to-docx",
  "version": "1.0.0",
  "description": "Markdown to DOCX converter for bruce-doc-converter",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "test": "node --test ../../tests/md_to_docx.test.js"
  },
  "dependencies": {
    "@mermaid-js/mermaid-cli": "^11.12.0",
    "docx": "^9.5.1",
    "jsdom": "^24.0.0"
  }
}
```

to:

```json
{
  "name": "md-to-docx",
  "version": "1.0.0",
  "description": "Markdown to DOCX converter for bruce-doc-converter",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "test": "node --test ../../tests/md_to_docx.test.js"
  },
  "dependencies": {
    "@mermaid-js/mermaid-cli": "^11.12.0",
    "docx": "^9.5.1",
    "jsdom": "^24.0.0"
  }
}
```

The script remains valid because the package directory is still two levels below the repository root.

- [ ] **Step 4: Run Node tests**

Run:

```bash
npm --prefix bruce_doc_converter/md_to_docx test
```

Expected: all Node tests pass.

- [ ] **Step 5: Run Markdown-to-DOCX smoke test**

Run:

```bash
tmpdir="$(mktemp -d)"
printf '# Title\n\n```mermaid\nflowchart TD\n  A-->B\n```\n' > "$tmpdir/sample.md"
python - <<'PY' "$tmpdir/sample.md" "$tmpdir/out"
import json
import sys
from bruce_doc_converter.converter import convert_document
result = convert_document(sys.argv[1], output_dir=sys.argv[2])
print(json.dumps(result, ensure_ascii=False))
raise SystemExit(0 if result.get("success") else 1)
PY
test -f "$tmpdir/out/sample.docx"
```

Expected: command exits 0 and `sample.docx` exists.

- [ ] **Step 6: Commit**

```bash
git add bruce_doc_converter/md_to_docx tests/md_to_docx.test.js
git rm -r scripts/md_to_docx
git commit -m "refactor: bundle markdown docx node module"
```

---

### Task 4: Implement CLI Convert and Batch Commands

**Files:**
- Modify: `bruce_doc_converter/cli.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Add failing CLI convert tests**

Append to `tests/test_cli.py`:

```python
import tempfile
from pathlib import Path

from docx import Document


class CliConvertTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-m", "bruce_doc_converter.cli", *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def test_convert_docx_outputs_protocol_v1(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            input_path = tmp_path / "sample.docx"
            doc = Document()
            doc.add_paragraph("正文")
            doc.save(input_path)

            result = self.run_cli("convert", str(input_path))

            self.assertEqual(0, result.returncode, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual("1.0", payload["schema_version"])
            self.assertTrue(payload["success"])
            self.assertEqual(str(input_path.resolve()), payload["input_path"])
            self.assertEqual("docx", payload["input_format"])
            self.assertEqual("markdown", payload["output_format"])
            self.assertIn("正文", payload["markdown_content"])
            self.assertEqual([], payload["warnings"])
            self.assertIn("extracted_images", payload)

    def test_convert_missing_file_outputs_error_code(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            missing = Path(tmp_dir) / "missing.docx"

            result = self.run_cli("convert", str(missing))

            self.assertEqual(1, result.returncode)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["success"])
            self.assertEqual("FILE_NOT_FOUND", payload["error_code"])
            self.assertEqual(str(missing.resolve()), payload["input_path"])

    def test_batch_outputs_protocol_v1(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            input_path = tmp_path / "sample.docx"
            doc = Document()
            doc.add_paragraph("批量正文")
            doc.save(input_path)

            result = self.run_cli("batch", str(tmp_path))

            self.assertEqual(0, result.returncode, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual("1.0", payload["schema_version"])
            self.assertTrue(payload["success"])
            self.assertEqual(1, payload["total"])
            self.assertEqual(1, payload["succeeded"])
            self.assertEqual(0, payload["failed"])
            self.assertEqual(1, len(payload["results"]))
```

- [ ] **Step 2: Run failing CLI convert tests**

Run:

```bash
python -m unittest tests.test_cli -v
```

Expected: convert and batch tests fail because commands are not implemented.

- [ ] **Step 3: Implement CLI command parsing and protocol wrapping**

Replace `bruce_doc_converter/cli.py` with:

```python
import argparse
import json
import os
import sys

from bruce_doc_converter.converter import SUPPORTED_EXTENSIONS, batch_convert, convert_document

SCHEMA_VERSION = "1.0"

SUGGESTIONS = {
    "UNSUPPORTED_FORMAT": "请先转换为 .docx/.xlsx/.pptx 后再重试。",
    "NODE_NOT_FOUND": "请安装 Node.js 后重试 Markdown 到 Word 转换。",
    "EMPTY_PDF_CONTENT": "请先对扫描件执行 OCR，或解除 PDF 保护后重试。",
}


def _emit(payload, exit_code):
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return exit_code


def _format_of(path):
    ext = os.path.splitext(str(path))[1].lower()
    return ext[1:] if ext.startswith(".") else ext


def _output_format(input_format):
    return "docx" if input_format == "md" else "markdown"


def _classify_error(error):
    text = error or ""
    if "文件不存在" in text or "目录不存在" in text or "文件未找到" in text:
        return "FILE_NOT_FOUND"
    if "输入路径不是文件" in text:
        return "NOT_A_FILE"
    if "输入路径不是目录" in text or "输出路径不是目录" in text:
        return "NOT_A_DIRECTORY"
    if "文件过大" in text:
        return "FILE_TOO_LARGE"
    if "不支持的文件格式" in text or "不支持的文件类型" in text:
        return "UNSUPPORTED_FORMAT"
    if "未找到 Node.js" in text:
        return "NODE_NOT_FOUND"
    if "Node.js 依赖安装失败" in text or "依赖安装失败" in text:
        return "DEPENDENCY_INSTALL_FAILED"
    if "Node.js 脚本输出解析失败" in text or "调用 Node.js 脚本失败" in text:
        return "NODE_CONVERSION_FAILED"
    if "转换超时" in text:
        return "CONVERSION_TIMEOUT"
    if "PDF 未提取到任何文本或表格" in text:
        return "EMPTY_PDF_CONTENT"
    if "权限不足" in text:
        return "PERMISSION_DENIED"
    if "内存不足" in text:
        return "OUT_OF_MEMORY"
    if "系统错误" in text:
        return "OS_ERROR"
    return "CONVERSION_ERROR"


def _normalize_single_result(input_path, result):
    normalized_input = os.path.abspath(os.path.normpath(os.path.expanduser(str(input_path))))
    input_format = _format_of(normalized_input)

    if result.get("success"):
        payload = {
            "schema_version": SCHEMA_VERSION,
            "success": True,
            "input_path": normalized_input,
            "input_format": input_format,
            "output_format": _output_format(input_format),
            "output_path": result.get("output_path"),
            "warnings": [],
        }
        if input_format == "md":
            payload["message"] = result.get("message", "")
        else:
            payload["markdown_content"] = result.get("markdown_content", "")
            payload["extracted_images"] = result.get("extracted_images", [])
        if result.get("warning"):
            payload["warnings"].append(result["warning"])
        return payload

    error = result.get("error", "转换失败")
    error_code = _classify_error(error)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "success": False,
        "input_path": normalized_input,
        "input_format": input_format,
        "error_code": error_code,
        "error": error,
    }
    if error_code in SUGGESTIONS:
        payload["suggestion"] = SUGGESTIONS[error_code]
    return payload


def _help_payload():
    return {
        "schema_version": SCHEMA_VERSION,
        "success": True,
        "commands": {
            "convert": "Convert one .docx/.xlsx/.pptx/.pdf file to Markdown, or one .md file to DOCX.",
            "batch": "Convert supported files in a directory.",
        },
        "supported_extensions": SUPPORTED_EXTENSIONS,
    }


def _build_parser():
    parser = argparse.ArgumentParser(prog="bdc", add_help=True)
    parser.add_argument("--help-json", action="store_true")
    subparsers = parser.add_subparsers(dest="command")

    convert_parser = subparsers.add_parser("convert")
    convert_parser.add_argument("file")
    convert_parser.add_argument("--output-dir")
    convert_parser.add_argument("--extract-images", choices=["true", "false"], default="true")

    batch_parser = subparsers.add_parser("batch")
    batch_parser.add_argument("directory")
    batch_parser.add_argument("--output-dir")
    batch_parser.add_argument("--recursive", choices=["true", "false"], default="true")
    batch_parser.add_argument("--extract-images", choices=["true", "false"], default="true")
    return parser


def _usage_error(message):
    return {
        "schema_version": SCHEMA_VERSION,
        "success": False,
        "error_code": "USAGE_ERROR",
        "error": message,
    }


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        return _emit(_usage_error("缺少命令。可用命令: convert, batch"), 1)

    parser = _build_parser()
    namespace = parser.parse_args(args)

    if namespace.help_json:
        return _emit(_help_payload(), 0)

    if namespace.command == "convert":
        result = convert_document(
            namespace.file,
            extract_images=namespace.extract_images == "true",
            output_dir=namespace.output_dir,
        )
        payload = _normalize_single_result(namespace.file, result)
        return _emit(payload, 0 if payload["success"] else 1)

    if namespace.command == "batch":
        raw_results = batch_convert(
            namespace.directory,
            recursive=namespace.recursive == "true",
            extract_images=namespace.extract_images == "true",
            output_dir=namespace.output_dir,
        )
        results = [
            {
                "file": item["file"],
                "result": _normalize_single_result(item["file"], item["result"]),
            }
            for item in raw_results
        ]
        succeeded = sum(1 for item in results if item["result"]["success"])
        total = len(results)
        payload = {
            "schema_version": SCHEMA_VERSION,
            "success": succeeded == total,
            "total": total,
            "succeeded": succeeded,
            "failed": total - succeeded,
            "results": results,
        }
        return _emit(payload, 0 if payload["success"] else 1)

    return _emit(_usage_error("缺少命令。可用命令: convert, batch"), 1)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
python -m unittest tests.test_cli -v
```

Expected: all CLI tests pass.

- [ ] **Step 5: Run converter tests**

Run:

```bash
python -m unittest tests.test_convert_document -v
```

Expected: all converter tests pass.

- [ ] **Step 6: Commit**

```bash
git add bruce_doc_converter/cli.py tests/test_cli.py
git commit -m "feat: implement agent JSON CLI commands"
```

---

### Task 5: Delete Legacy Script Entrypoints

**Files:**
- Delete: `convert.sh`
- Delete: `convert.ps1`
- Delete: `convert.bat`
- Delete: `scripts/convert_document.py`

- [ ] **Step 1: Assert docs and tests no longer need legacy scripts**

Run:

```bash
rg -n "convert\\.sh|convert\\.ps1|convert\\.bat|scripts/convert_document.py|python convert_document.py"
```

Expected: matches still exist in docs and `SKILL.md`; they will be updated in Task 6.

- [ ] **Step 2: Delete legacy entrypoints**

Run:

```bash
git rm convert.sh convert.ps1 convert.bat scripts/convert_document.py
```

- [ ] **Step 3: Remove empty scripts directory if empty**

Run:

```bash
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 4: Run Python and Node tests**

Run:

```bash
python -m unittest tests.test_cli tests.test_convert_document -v
npm --prefix bruce_doc_converter/md_to_docx test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy script entrypoints"
```

---

### Task 6: Slim Skill and Documentation for Agent CLI

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `requirements.txt`

- [ ] **Step 1: Replace `SKILL.md` body**

Replace `SKILL.md` content with:

```markdown
---
name: bruce-doc-converter
description: 双向文档转换工具，将 Word (.docx)、Excel (.xlsx)、PowerPoint (.pptx) 和 PDF (.pdf) 转换为 AI 友好的 Markdown，或将 Markdown (.md) 转换为 Word (.docx)。当用户请求文档转换、导出、读取、分析 Office/PDF/Markdown 文件，或上传这些格式并询问内容时使用。
---
# Bruce Doc Converter

Agent-facing document converter CLI.

## When to use

Use this skill when the user asks to:

- Convert `.docx`, `.xlsx`, `.pptx`, `.pdf`, or `.md` files.
- Read, summarize, inspect, or analyze Office/PDF documents.
- Export Markdown as Word.
- Process uploaded document files whose content the agent cannot directly read.

## Command

Run:

```bash
bdc convert "<file>"
```

For batch conversion:

```bash
bdc batch "<directory>"
```

The CLI prints JSON to stdout by default. Dependency installation and progress logs may appear on stderr.

If `bdc` is not installed, install the package first:

```bash
python -m pip install bruce-doc-converter
```

## Output handling

Parse stdout as JSON.

On success:

- `success` is `true`.
- `output_path` points to the generated file.
- Office/PDF inputs include `markdown_content` for direct analysis.
- `.md` inputs produce a `.docx` file and may omit `markdown_content`.

On failure:

- `success` is `false`.
- Use `error_code`, `error`, and optional `suggestion` to decide the next step.
- Do not pre-check Python or Node dependencies. Run the command first and react to JSON failure.

## Supported formats

| Input | Output |
| --- | --- |
| `.docx` | Markdown |
| `.xlsx` | Markdown |
| `.pptx` | Markdown |
| `.pdf` | Markdown |
| `.md` | Word `.docx` |
```

- [ ] **Step 2: Update README install and usage sections**

In `README.md`, replace installation and usage references to script entrypoints with:

```markdown
## 安装

```bash
python -m pip install bruce-doc-converter
```

## Agent CLI 用法

```bash
bdc convert /path/to/document.docx
bdc convert /path/to/notes.md
bdc batch /path/to/documents
```

CLI 默认向 stdout 输出 JSON，stderr 仅用于进度和依赖安装日志。
```

Also remove mentions of `convert.sh`, `convert.ps1`, and `convert.bat`.

- [ ] **Step 3: Update English README the same way**

In `README.en.md`, replace legacy script instructions with:

```markdown
## Installation

```bash
python -m pip install bruce-doc-converter
```

## Agent CLI Usage

```bash
bdc convert /path/to/document.docx
bdc convert /path/to/notes.md
bdc batch /path/to/documents
```

The CLI writes JSON to stdout by default. Progress and dependency installation logs go to stderr.
```

- [ ] **Step 4: Decide requirements file content**

Replace `requirements.txt` with:

```text
python-docx
openpyxl
python-pptx
pdfplumber
```

This keeps local development simple while `pyproject.toml` remains the packaging source of truth.

- [ ] **Step 5: Verify no legacy script references remain**

Run:

```bash
rg -n "convert\\.sh|convert\\.ps1|convert\\.bat|scripts/convert_document.py|python convert_document.py"
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add SKILL.md README.md README.en.md requirements.txt
git commit -m "docs: document agent CLI workflow"
```

---

### Task 7: Package Installation and End-to-End Verification

**Files:**
- Modify if needed: `pyproject.toml`
- Modify if needed: `bruce_doc_converter/cli.py`

- [ ] **Step 1: Install package in editable mode**

Run:

```bash
python -m pip install -e .
```

Expected: `bdc` and `bruce-doc-converter` are installed in the active Python environment.

- [ ] **Step 2: Verify console script aliases**

Run:

```bash
bdc --help-json
bruce-doc-converter --help-json
```

Expected: both commands print JSON with `"success": true`.

- [ ] **Step 3: Run full Python tests**

Run:

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

Expected: all Python tests pass.

- [ ] **Step 4: Run Node tests**

Run:

```bash
npm --prefix bruce_doc_converter/md_to_docx test
```

Expected: all Node tests pass.

- [ ] **Step 5: Run Office-to-Markdown smoke test through installed CLI**

Run:

```bash
tmpdir="$(mktemp -d)"
python - <<'PY' "$tmpdir/sample.docx"
import sys
from docx import Document
doc = Document()
doc.add_heading("标题", level=1)
doc.add_paragraph("正文")
doc.save(sys.argv[1])
PY
bdc convert "$tmpdir/sample.docx" > "$tmpdir/result.json"
python - <<'PY' "$tmpdir/result.json"
import json
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
assert payload["schema_version"] == "1.0"
assert payload["success"] is True
assert payload["input_format"] == "docx"
assert payload["output_format"] == "markdown"
assert "正文" in payload["markdown_content"]
print(payload["output_path"])
PY
```

Expected: command exits 0 and prints generated Markdown path.

- [ ] **Step 6: Run Markdown-to-Word smoke test through installed CLI**

Run:

```bash
tmpdir="$(mktemp -d)"
printf '# Title\n\nBody\n' > "$tmpdir/sample.md"
bdc convert "$tmpdir/sample.md" --output-dir "$tmpdir/out" > "$tmpdir/md-result.json"
python - <<'PY' "$tmpdir/md-result.json" "$tmpdir/out/sample.docx"
import json
import os
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
assert payload["schema_version"] == "1.0"
assert payload["success"] is True
assert payload["input_format"] == "md"
assert payload["output_format"] == "docx"
assert os.path.exists(sys.argv[2])
PY
```

Expected: command exits 0 and output DOCX exists.

- [ ] **Step 7: Commit final packaging fixes**

If Step 1-6 required edits:

```bash
git add pyproject.toml bruce_doc_converter
git commit -m "fix: complete package installation workflow"
```

If no edits were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: Python CLI, two command aliases, JSON default, Office/PDF-to-Markdown, Markdown-to-DOCX, Node subprocess retention, batch conversion, docs update, skill slimming, and legacy script deletion are covered.
- Placeholder scan: no TBD/TODO placeholders remain; steps include concrete file paths and commands.
- Type consistency: JSON keys use `schema_version`, `success`, `input_path`, `input_format`, `output_format`, `output_path`, `markdown_content`, `extracted_images`, `warnings`, `error_code`, `error`, and `suggestion` consistently.
