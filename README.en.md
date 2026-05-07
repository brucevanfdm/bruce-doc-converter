# Bruce Doc Converter

> Bi-directional document conversion for Claude Code / OpenClaw

[![Agent Skill](https://img.shields.io/badge/Agent_Skill-Skill-purple.svg)](https://github.com/anthropics/claude-code)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Bruce Doc Converter** is an agent-facing document converter CLI that gives **Claude Code / OpenClaw** bi-directional document conversion capabilities:

- **Office/PDF → Markdown**: Convert Word, Excel, PowerPoint, and PDF into AI-friendly Markdown
- **Markdown → Word**: Export Markdown as a professionally formatted Word document with automatic Mermaid diagram rendering

## Installation

```bash
pipx install bruce-doc-converter
```

If `pipx` is not available, use a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install bruce-doc-converter
```

## Agent CLI Usage

```bash
bdc convert /path/to/document.docx
bdc convert /path/to/notes.md
bdc batch /path/to/documents
```

The CLI writes JSON to stdout by default. Progress logs go to stderr.

Markdown to Word requires Node.js dependencies. Initialize them explicitly before first use:

```bash
bdc setup-node
```

By default this runs `npm ci --ignore-scripts` against the locked dependency set, avoiding third-party npm lifecycle scripts. If your Mermaid rendering environment needs npm lifecycle scripts to download browser dependencies, use:

```bash
bdc setup-node --allow-scripts
```

`bdc setup-node` is idempotent: if the shared dependency directory already matches the installed package, it returns success and skips installation. Recoverable failures include `retryable` and `next_command` JSON fields; agents should prefer those machine-readable fields for remediation.

Get help:

```bash
bdc --help-json
```

### Success output (single file)

```json
{
  "schema_version": "1.0",
  "success": true,
  "input_path": "/absolute/input.docx",
  "input_format": "docx",
  "output_format": "markdown",
  "output_path": "/absolute/Markdown/input.md",
  "markdown_content": "# content...",
  "extracted_images": [],
  "warnings": []
}
```

### Failure output

```json
{
  "schema_version": "1.0",
  "success": false,
  "input_path": "/absolute/input.doc",
  "input_format": "doc",
  "error_code": "UNSUPPORTED_FORMAT",
  "error": "Unsupported format: .doc. Supported: .docx, .xlsx, .pptx, .pdf, .md",
  "suggestion": "Convert the file to .docx/.xlsx/.pptx first."
}
```

### Batch output

For batch conversion, `success` means every file converted successfully. If only some files fail, `success` is `false`, while `succeeded`, `failed`, and `results` still report per-file details.

```json
{
  "schema_version": "1.0",
  "success": true,
  "total": 1,
  "succeeded": 1,
  "failed": 0,
  "results": [
    {
      "input_path": "/absolute/input.docx",
      "result": {
        "schema_version": "1.0",
        "success": true,
        "input_path": "/absolute/input.docx",
        "input_format": "docx",
        "output_format": "markdown",
        "output_path": "/absolute/Markdown/input.md",
        "markdown_content": "# content...",
        "extracted_images": [],
        "warnings": []
      }
    }
  ]
}
```

## Features

- **Heading detection**: Automatically recognizes Word heading levels (Heading 1–6) and Chinese heading styles
- **Format preservation**: Retains bold, italic, and other inline formatting
- **Table conversion**: Converts tables to clean Markdown
- **List support**: Ordered, unordered, and nested lists
- **Mermaid diagrams**: Renders Mermaid code blocks via `mmdc` and embeds them as PNG images in Word
- **Image extraction**: Extracts embedded images during Office/PDF → Markdown conversion

## Supported Formats

| Format | Input | Output | Quality |
| --- | --- | --- | --- |
| Word (.docx) | ✅ | ✅ | Excellent |
| Excel (.xlsx) | ✅ | ❌ | Excellent |
| PowerPoint (.pptx) | ✅ | ❌ | Good |
| PDF (.pdf) | ✅ | ❌ | Depends on file type |
| Markdown (.md) | ✅ | ✅ | Excellent |

> **Note**: Legacy formats (.doc, .xls, .ppt) are not supported. Convert them to modern formats first.

## Requirements

- **Python 3.8+** (required)
- **Node.js 14+** (optional, only needed for Markdown → Word)

## FAQ

### File too large?

Current limit is 100 MB. Consider splitting the file or reducing content.

### Markdown → Word failing?

Node.js is required, and the Node.js dependencies must be installed explicitly:

```bash
bdc setup-node
```

On Linux, Chromium is not launched with `--no-sandbox` by default. If you understand the risk and your environment requires it, set `BRUCE_DOC_CONVERTER_ALLOW_CHROMIUM_NO_SANDBOX=1` before conversion.

### PDF returns no content?

Scanned PDFs require OCR first. Protected PDFs must be unlocked before conversion.

## Best Practices

1. **Use modern Office formats** (.docx, .xlsx, .pptx)
2. **Prefer text-based PDFs** over scanned images; run OCR first if needed
3. **Keep files under 50 MB** for best performance

## Project Structure

```
bruce-doc-converter/
├── skills/
│   └── SKILL.md                  # Agent Skill definition
├── pyproject.toml                # Python package metadata
├── requirements.txt              # Local development dependencies
├── bruce_doc_converter/
│   ├── __init__.py
│   ├── cli.py                    # bdc CLI entry point
│   ├── converter.py              # Core conversion logic
│   └── md_to_docx/              # Node.js module for Markdown → Word
└── tests/
    ├── test_cli.py
    ├── test_convert_document.py
    └── md_to_docx.test.js
```

## License

MIT License
