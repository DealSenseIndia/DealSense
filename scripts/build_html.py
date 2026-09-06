"""
DealWise HTML Template Compiler.
Stitches modular component templates from frontend/templates/ into frontend/index.html.
"""

from pathlib import Path
from jinja2 import Environment, FileSystemLoader

ROOT_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = ROOT_DIR / "frontend" / "templates"
OUTPUT_FILE = ROOT_DIR / "frontend" / "index.html"


def build_html():
    if not TEMPLATES_DIR.exists():
        print(f"Templates directory not found: {TEMPLATES_DIR}")
        return

    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=False)
    template = env.get_template("base.html")
    rendered = template.render()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(rendered)

    print(f"Successfully compiled {OUTPUT_FILE.name} from templates ({len(rendered):,} bytes)")


if __name__ == "__main__":
    build_html()
