"""把源石黑體（GenSeki Gothic 2 TW，SIL OFL 1.1）裁成網站用得到的字，輸出 woff2。

網站文字改了就重跑：python tools/make_fonts.py
需要 fonttools、brotli。字型來源找 C:/Windows/Fonts 與使用者字型資料夾，可用環境變數 GENSEKI_DIR 改。
"""
import os, pathlib, re
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "assets" / "fonts"
SRC = next(p for p in [pathlib.Path(os.environ.get("GENSEKI_DIR", "C:/Windows/Fonts")), pathlib.Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Windows/Fonts"] if (p / "GenSekiGothic2TW-B.otf").exists())

ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
EXTRA = "，。、；：！？「」『』（）《》〈〉…—－～・　％＋＝×÷０１２３４５６７８９"

def site_text():
    chars = set()
    for p in DOCS.rglob("*"):
        if p.suffix in {".html", ".js", ".css"} and p.name != "qrcode.js":
            chars |= set(p.read_text(encoding="utf-8"))
    return "".join(sorted(c for c in chars if ord(c) > 0x7F and not c.isspace()))

def build(src, dst, text):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(SRC / src), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    subset.save_font(font, str(OUT / dst), opts)
    print(f"{dst}: {len(set(text))} 字, {(OUT / dst).stat().st_size / 1024:.0f} KB")

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    full = ASCII + EXTRA + site_text()
    build("GenSekiGothic2TW-M.otf", "genseki-m.woff2", full)
    build("GenSekiGothic2TW-B.otf", "genseki-b.woff2", full)
    # 特粗只用在房間碼、票數這些數字
    build("GenSekiGothic2TW-H.otf", "genseki-h.woff2", ASCII + "０１２３４５６７８９％")
