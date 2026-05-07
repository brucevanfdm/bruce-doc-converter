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

## Installation

First, check if `bdc` is already available:

```bash
command -v bdc        # macOS / Linux
where bdc             # Windows
```

If not installed, try the following in order — stop at the first that succeeds:

```bash
# 1. pipx (preferred — isolated, bdc lands in PATH)
pipx install bruce-doc-converter

# 2. uv (if available — fast, isolated, bdc lands in PATH)
uv tool install bruce-doc-converter

# 3. pip --user (most universally available, bdc lands in PATH)
pip3 install --user bruce-doc-converter  # macOS/Linux
pip install --user bruce-doc-converter   # Windows
# or universally: python3 -m pip install --user bruce-doc-converter (use `python` on Windows)

# 4. venv fallback (works everywhere, but bdc will NOT be in PATH)
python3 -m venv .venv
.venv/bin/pip install bruce-doc-converter
# Windows: .venv\Scripts\pip install bruce-doc-converter
```

> **venv note:** If you used the venv fallback, replace every `bdc` command below with `.venv/bin/bdc` (macOS/Linux) or `.venv\Scripts\bdc` (Windows).

> **Windows note:** Use `python` instead of `python3` if the former is not recognized.

## Command

Run:

```bash
bdc convert "<file>"
```

For batch conversion:

```bash
bdc batch "<directory>"
```

For Markdown to Word, initialize the Node.js dependencies explicitly before first use:

```bash
bdc setup-node
```

The CLI prints JSON to stdout by default. Progress logs may appear on stderr.

## Output handling

Parse stdout as JSON.

On success:

- `success` is `true`.
- `output_path` points to the generated file.
- Office/PDF inputs include `markdown_content` for direct analysis.
- `.md` inputs produce a `.docx` file and may omit `markdown_content`.

On failure:

- `success` is `false`.
- Use `error_code`, `retryable`, optional `next_command`, `error`, and optional `suggestion` to decide the next step.
- Do not pre-check Python dependencies. Run the command first and react to JSON failure.
- If Markdown to Word returns `DEPENDENCY_INSTALL_REQUIRED`, run `next_command` when present, otherwise run `bdc setup-node`, then retry.
- `bdc setup-node` is idempotent and may return `already_installed: true` with `install_action: "skipped"`.

## Troubleshooting installation

| Error | Cause | Fix |
| --- | --- | --- |
| `SOCKS support` / proxy connection error | `all_proxy` or `http_proxy` env vars set | Run `unset all_proxy http_proxy https_proxy` (macOS/Linux) or `set all_proxy=` (Windows CMD), then retry |
| `command not found: pipx` | pipx not installed | Try `uv tool install` or `pip install --user` instead |
| `externally-managed-environment` | Python 3.11+ system Python forbids global pip | Use `pipx`, `uv tool install`, or the venv fallback |
| Permission denied | No write access to install location | Add `--user` flag, or use venv fallback |
| `bdc: command not found` after venv install | venv bin not in PATH | Use full path: `.venv/bin/bdc` (macOS/Linux) or `.venv\Scripts\bdc` (Windows) |

## Supported formats

| Input | Output |
| --- | --- |
| `.docx` | Markdown |
| `.xlsx` | Markdown |
| `.pptx` | Markdown |
| `.pdf` | Markdown |
| `.md` | Word `.docx` |
