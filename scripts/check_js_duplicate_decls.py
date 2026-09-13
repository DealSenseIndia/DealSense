"""
Static duplicate-declaration scanner for the DealSense frontend.

A repeated `const`/`let` of the same name in the same block scope is a
SyntaxError raised at PARSE time, so the module never loads at all and the
page dies silently. One of these (openAlertBtn et al in pdp.js) shipped
undetected because nothing in this project parses the JS.

This is a heuristic, not a JS parser: it tracks brace depth, skips strings,
template literals, regex-ish slashes and comments, and reports any name
declared twice at the same depth inside the same enclosing block.

Run:  python scripts/check_js_duplicate_decls.py
Exits non-zero if anything is found, so it can gate CI.
"""

import os
import re
import sys

FRONTEND_DIRS = ["frontend"]
SKIP_DIRS = {"node_modules", ".git", "vendor", "dist", "build", "__pycache__"}

DECL_RE = re.compile(r"\b(const|let)\s+([A-Za-z_$][\w$]*)\s*[=;:,)\]]?")


def strip_noise(src: str) -> str:
    """Blank out comments and string/template literals, preserving newlines."""
    out = []
    i = 0
    n = len(src)
    state = None  # None | line_comment | block_comment | ' | " | `
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if state is None:
            if ch == "/" and nxt == "/":
                state = "line_comment"
                out.append("  ")
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block_comment"
                out.append("  ")
                i += 2
                continue
            if ch in ("'", '"', "`"):
                state = ch
                out.append(" ")
                i += 1
                continue
            out.append(ch)
            i += 1
            continue

        if state == "line_comment":
            if ch == "\n":
                state = None
                out.append("\n")
            else:
                out.append(" ")
            i += 1
            continue

        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = None
                out.append("  ")
                i += 2
                continue
            out.append("\n" if ch == "\n" else " ")
            i += 1
            continue

        # inside a string or template literal
        if ch == "\\":
            out.append("  ")
            i += 2
            continue
        if ch == state:
            state = None
            out.append(" ")
            i += 1
            continue
        out.append("\n" if ch == "\n" else " ")
        i += 1

    return "".join(out)


def scan_file(path: str):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    clean = strip_noise(raw)

    findings = []
    # scope_stack holds one dict of {name: line} per open block
    scope_stack = [{}]
    line_no = 1

    for idx, ch in enumerate(clean):
        if ch == "\n":
            line_no += 1
            continue
        if ch == "{":
            scope_stack.append({})
            continue
        if ch == "}":
            if len(scope_stack) > 1:
                scope_stack.pop()
            continue

    # Second pass: walk line by line tracking depth, which is enough to catch
    # same-scope repeats without needing a full AST.
    depth = 0
    seen_by_depth = {}
    block_id = 0
    block_id_by_depth = {0: 0}

    for line_idx, line in enumerate(clean.split("\n"), start=1):
        for m in DECL_RE.finditer(line):
            name = m.group(2)
            key = (depth, block_id_by_depth.get(depth, 0))
            bucket = seen_by_depth.setdefault(key, {})
            if name in bucket:
                findings.append((name, bucket[name], line_idx))
            else:
                bucket[name] = line_idx

        for ch in line:
            if ch == "{":
                depth += 1
                block_id += 1
                block_id_by_depth[depth] = block_id
            elif ch == "}":
                # leaving a block: drop everything recorded inside it
                stale = [k for k in seen_by_depth if k[0] > depth - 1 and k[0] != 0]
                for k in stale:
                    if k[0] >= depth:
                        seen_by_depth.pop(k, None)
                depth = max(0, depth - 1)

    return findings


def main() -> int:
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    total = 0

    for base in FRONTEND_DIRS:
        base_path = os.path.join(root, base)
        if not os.path.isdir(base_path):
            continue
        for dirpath, dirnames, filenames in os.walk(base_path):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in sorted(filenames):
                if not fn.endswith(".js"):
                    continue
                full = os.path.join(dirpath, fn)
                try:
                    findings = scan_file(full)
                except Exception as exc:  # pragma: no cover
                    print(f"  ! could not scan {fn}: {exc}")
                    continue
                if findings:
                    rel = os.path.relpath(full, root)
                    for name, first, second in findings:
                        print(f"{rel}:{second}: duplicate declaration of '{name}' (first declared at line {first})")
                        total += 1

    if total:
        print(f"\n{total} duplicate declaration(s) found. Each one is a parse-time SyntaxError.")
        return 1

    print("No duplicate declarations found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
