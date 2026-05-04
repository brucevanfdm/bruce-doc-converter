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
