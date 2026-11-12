"""Gera index.html (arquivo único) a partir de src/ + bibliotecas + planilha embutida.

Uso:
    npm install
    python3 scripts/build.py [caminho/da/planilha.xlsx] [saida.html]
"""
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "banco_dados_estetica_medica.xlsx"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "index.html"

libs = {
    "{{CHARTJS}}": ROOT / "node_modules/chart.js/dist/chart.umd.min.js",
    "{{FFLATE}}": ROOT / "node_modules/fflate/umd/index.js",
}
for p in libs.values():
    if not p.exists():
        sys.exit(f"Arquivo não encontrado: {p}\nRode `npm install` antes do build.")

app = "\n".join((SRC / f).read_text(encoding="utf-8") for f in ["app1_data.js", "app2_ui.js", "app3_pages.js"])
parts = {k: p.read_text(encoding="utf-8") for k, p in libs.items()}
parts["{{APP}}"] = app
for k, code in parts.items():
    if "</script" in code.lower():
        sys.exit(f"{k} contém '</script' e quebraria o HTML.")
parts["{{XLSX_B64}}"] = base64.b64encode(xlsx.read_bytes()).decode()

html = (SRC / "template.html").read_text(encoding="utf-8")
for k, v in parts.items():
    html = html.replace(k, v)
out.write_text(html, encoding="utf-8")
print(f"OK: {out} ({out.stat().st_size / 1024:.0f} KB) — planilha: {xlsx.name}")
