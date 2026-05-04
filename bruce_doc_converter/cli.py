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


def _usage_error(message):
    return {
        "schema_version": SCHEMA_VERSION,
        "success": False,
        "error_code": "USAGE_ERROR",
        "error": message,
    }


class _JsonArgumentParser(argparse.ArgumentParser):
    """ArgumentParser that emits JSON on error instead of human-readable text."""

    def error(self, message):
        _emit(_usage_error(message), 1)
        sys.exit(1)


def _format_of(path):
    ext = os.path.splitext(str(path))[1].lower()
    if not ext:
        return "unknown"
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
    normalized_input = os.path.realpath(os.path.expanduser(str(input_path)))
    input_format = _format_of(normalized_input)

    if result.get("success"):
        raw_output = result.get("output_path")
        output_path = os.path.realpath(raw_output) if raw_output else None
        payload = {
            "schema_version": SCHEMA_VERSION,
            "success": True,
            "input_path": normalized_input,
            "input_format": input_format,
            "output_format": _output_format(input_format),
            "output_path": output_path,
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
    error_code = result.get("error_code") or _classify_error(error)
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
    # add_help=False: -h would print human text, breaking the JSON-only stdout contract.
    # Use --help-json for machine-readable help instead.
    parser = _JsonArgumentParser(prog="bdc", add_help=False)
    parser.add_argument("--help-json", action="store_true")
    subparsers = parser.add_subparsers(dest="command")

    # Subparsers inherit _JsonArgumentParser because type(parser) is _JsonArgumentParser
    convert_parser = subparsers.add_parser("convert", add_help=False)
    convert_parser.add_argument("file")
    convert_parser.add_argument("--output-dir")
    convert_parser.add_argument("--extract-images", choices=["true", "false"], default="true")

    batch_parser = subparsers.add_parser("batch", add_help=False)
    batch_parser.add_argument("directory")
    batch_parser.add_argument("--output-dir")
    batch_parser.add_argument("--recursive", choices=["true", "false"], default="true")
    batch_parser.add_argument("--extract-images", choices=["true", "false"], default="true")
    return parser


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        return _emit(_usage_error("缺少命令。可用命令: convert, batch"), 1)

    parser = _build_parser()
    namespace = parser.parse_args(args)

    if namespace.help_json:
        return _emit(_help_payload(), 0)

    if namespace.command == "convert":
        output_dir = os.path.realpath(os.path.expanduser(namespace.output_dir)) if namespace.output_dir else None
        result = convert_document(
            namespace.file,
            extract_images=namespace.extract_images == "true",
            output_dir=output_dir,
        )
        payload = _normalize_single_result(namespace.file, result)
        return _emit(payload, 0 if payload["success"] else 1)

    if namespace.command == "batch":
        output_dir = os.path.realpath(os.path.expanduser(namespace.output_dir)) if namespace.output_dir else None
        raw_results = batch_convert(
            namespace.directory,
            recursive=namespace.recursive == "true",
            extract_images=namespace.extract_images == "true",
            output_dir=output_dir,
        )
        results = []
        for item in raw_results:
            result_payload = _normalize_single_result(item["file"], item["result"])
            results.append({
                "input_path": result_payload["input_path"],
                "result": result_payload,
            })
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
