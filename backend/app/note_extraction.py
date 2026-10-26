"""Conservative local suggestions for when external AI is unavailable."""

import html
import re

ACTION = re.compile(
    r"(?i)^(?:todo\s*:|action\s*:|(?:build|fix|add|test|review|update|investigate|"
    r"create|ship|write|evaluate|implement|remove|reduce|put|check|make|change|"
    r"replace|delete|move|rename|enable|disable|ensure|include|exclude)\b)"
)
PREFIX = re.compile(r"^\s*(?:(?:[-*•]|\d+[.)])\s+)?(?:\[([ xX])\]\s*)?")


def local_titles(document: dict, plain_text: str) -> list[str]:
    lines = []

    def text(node):
        if any(mark.get("type") == "strike" for mark in node.get("marks", [])):
            return ""
        if node.get("type") == "hardBreak":
            return "\n"
        return node.get("text", "") + "".join(text(c) for c in node.get("content", []))

    def walk(node, in_list=False):
        kind = node.get("type")
        if kind == "paragraph":
            lines.extend((line, in_list) for line in text(node).splitlines())
        elif kind not in {"heading", "codeBlock"}:
            for child in node.get("content", []):
                walk(child, in_list or kind == "listItem")

    if document:
        walk(document)
    else:
        lines.extend((line, False) for line in plain_text.splitlines())
    titles = []
    seen = set()
    for raw, in_list in lines:
        line = html.unescape(raw).strip()
        prefix = PREFIX.match(line)
        if prefix.group(1) in {"x", "X"}:
            continue
        listed = in_list or bool(re.match(r"^(?:[-*•]|\d+[.)])\s+", line))
        value = line[prefix.end():].strip()
        if len(value) <= 5 or value.startswith("@") or re.match(r"(?i)^(?:done|completed)\s*:", value):
            continue
        contextual = re.match(r"(?i)^(?:in|for|on)\b[^,]+,\s*(.*)", value)
        if not (listed or ACTION.match(value) or (contextual and ACTION.match(contextual.group(1)))):
            continue
        title = re.sub(r"(?i)^(todo|action)\s*:\s*", "", value)[:200]
        if title.casefold() not in seen:
            titles.append(title)
            seen.add(title.casefold())
        if len(titles) == 10:
            break
    return titles
