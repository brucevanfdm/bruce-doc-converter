# Bruce Doc Converter

> 为 Claude Code / OpenClaw 添加双向文档转换能力

[![Agent Skill](https://img.shields.io/badge/Agent_Skill-Skill-purple.svg)](https://github.com/anthropics/claude-code)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Bruce Doc Converter** 是一个面向 Agent 的文档转换 CLI，为 **Claude Code / OpenClaw** 添加**双向文档转换**能力：

- **Office/PDF → Markdown**：将 Word、Excel、PowerPoint、PDF 转换为 AI 友好的 Markdown 格式
- **Markdown → Word**：将 Markdown 导出为排版精美的 Word 文档，自动渲染 Mermaid 图表

## 安装

```bash
pipx install bruce-doc-converter
```

如果 `pipx` 不可用：

```bash
python3 -m pip install bruce-doc-converter
# macOS Homebrew Python 需要加 --break-system-packages 或使用 venv：
# python3 -m venv .venv && .venv/bin/pip install bruce-doc-converter
```

## Agent CLI 用法

```bash
bdc convert /path/to/document.docx
bdc convert /path/to/notes.md
bdc batch /path/to/documents
```

CLI 默认向 stdout 输出 JSON，stderr 仅用于进度和依赖安装日志。

查看帮助：

```bash
bdc --help-json
```

### 输出示例（单文件成功）

```json
{
  "schema_version": "1.0",
  "success": true,
  "input_path": "/absolute/input.docx",
  "input_format": "docx",
  "output_format": "markdown",
  "output_path": "/absolute/Markdown/input.md",
  "markdown_content": "# 内容...",
  "extracted_images": [],
  "warnings": []
}
```

### 输出示例（失败）

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

## 功能特性

- **标题识别**：自动识别 Word 标题层级（Heading 1-6）及中文标题样式
- **格式保留**：保留粗体、斜体等文本格式
- **表格转换**：智能转换表格为 Markdown 格式
- **列表支持**：有序列表、无序列表及多级嵌套
- **Mermaid 图表**：支持通过 `mmdc` 渲染 Mermaid 代码块，嵌入 Word 为 PNG 图片
- **图片提取**：Office/PDF 转 Markdown 时可提取内嵌图片

## 支持的格式

| 格式               | 输入 | 输出 | 质量       |
| ------------------ | ---- | ---- | ---------- |
| Word (.docx)       | ✅   | ✅   | 优秀       |
| Excel (.xlsx)      | ✅   | ❌   | 优秀       |
| PowerPoint (.pptx) | ✅   | ❌   | 良好       |
| PDF (.pdf)         | ✅   | ❌   | 取决于类型 |
| Markdown (.md)     | ✅   | ✅   | 优秀       |

> **注意**：不支持旧版格式（.doc, .xls, .ppt），请先转换为新格式。

## 环境要求

- **Python 3.8+**（必需）
- **Node.js 14+**（可选，仅 Markdown → Word 需要）

## 常见问题

### 文件过大怎么办？

当前限制为 100MB，建议分割文件或压缩内容。

### Markdown 转 Word 失败？

需要安装 Node.js。如果 Node.js 已安装但仍报错，检查依赖：

```bash
npm --prefix bruce_doc_converter/md_to_docx install
```

### PDF 提取不到内容？

扫描型 PDF 需先执行 OCR，或解除 PDF 保护后重试。

## 最佳实践

1. **使用新版 Office 格式**（.docx, .xlsx, .pptx）
2. **PDF 优先使用文本型**，扫描型建议先 OCR
3. **文件大小建议 < 50MB**

## 项目结构

```
bruce-doc-converter/
├── SKILL.md                      # Agent Skill 定义
├── pyproject.toml                # Python 包元数据
├── requirements.txt              # 本地开发依赖
├── bruce_doc_converter/
│   ├── __init__.py
│   ├── cli.py                    # bdc CLI 入口
│   ├── converter.py              # 转换核心逻辑
│   └── md_to_docx/              # Markdown → Word 的 Node.js 模块
├── references/
│   └── supported-formats.md
└── tests/
    ├── test_cli.py
    ├── test_convert_document.py
    └── md_to_docx.test.js
```

## 许可证

MIT License
