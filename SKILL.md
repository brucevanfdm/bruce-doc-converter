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

For Markdown to Word, initialize the Node.js dependencies explicitly before first use:

```bash
bdc setup-node
```

The CLI prints JSON to stdout by default. Progress logs may appear on stderr.

If `bdc` is not installed, install the package first:

```bash
pipx install bruce-doc-converter
```

If `pipx` is not available, use a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install bruce-doc-converter
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
- Use `error_code`, `retryable`, optional `next_command`, `error`, and optional `suggestion` to decide the next step.
- Do not pre-check Python dependencies. Run the command first and react to JSON failure.
- If Markdown to Word returns `DEPENDENCY_INSTALL_REQUIRED`, run `next_command` when present, otherwise run `bdc setup-node`, then retry.
- `bdc setup-node` is idempotent and may return `already_installed: true` with `install_action: "skipped"`.

## Supported formats

| Input | Output |
| --- | --- |
| `.docx` | Markdown |
| `.xlsx` | Markdown |
| `.pptx` | Markdown |
| `.pdf` | Markdown |
| `.md` | Word `.docx` |
