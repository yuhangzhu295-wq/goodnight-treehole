#!/usr/bin/env python3
"""Measure what the V2 design images actually ask for, so Batch 1 changes the real thing.

The audit says "decorative, mascot-saturated, template cards" in prose. This measures the designs
themselves: background colour, dominant colours, how much of the canvas is non-background (ink
coverage), and how much is left as plain margin. The ratio of ink to margin is the number that
decides whether the current app is over-decorated: if the designs are mostly paper with a few dense
rows, then a page with a full-bleed illustration is wrong regardless of how nice the illustration is.

Writes artifacts/v2-source/design-metrics.json.
"""
import json
import os
import sys
from collections import Counter

from PIL import Image

DESIGN_DIR = r"C:\Users\zyu33\Downloads\V2 完整交付包\设计图"
NAMES = [
    ("01_TonightHome", "tonight-home"),
    ("22_Square", "square"),
    ("26_ToolIndex", "tool-index"),
    ("30_DiaryList", "diary-list"),
    ("33_LetterList", "letter-list"),
    ("04_Me", "me"),
    ("03_ActionCenter", "action-center"),
    ("36_PrivacySettings", "settings-privacy"),
]


def analyse(path):
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        small = rgb.resize((w // 4, h // 4))
        px = list(small.getdata())
    total = len(px)
    # Background = the single most common colour; margin = pixels within a small distance of it.
    counts = Counter(px)
    bg = counts.most_common(1)[0][0]
    near_bg = sum(1 for p in px if all(abs(p[i] - bg[i]) <= 10 for i in range(3)))
    # Distinct saturated colours: how many real hues carry the layout.
    sat = Counter()
    for p in px:
        mx, mn = max(p), min(p)
        if mx - mn > 40:
            sat[p] += 1
    return {
        "size": [w, h],
        "background": list(bg),
        "backgroundShare": round(near_bg / total, 4),
        "inkShare": round(1 - near_bg / total, 4),
        "distinctColours": len(counts),
        "saturatedColours": len(sat),
        "topSaturated": [("#%02x%02x%02x" % c, n) for c, n in sat.most_common(6)],
        "uniqueColours": len(counts),
    }


def main():
    rows = []
    for design, slug in NAMES:
        p = os.path.join(DESIGN_DIR, design + ".png")
        if not os.path.exists(p):
            rows.append({"slug": slug, "status": "missing"})
            continue
        m = analyse(p)
        m["slug"] = slug
        m["design"] = design
        rows.append(m)
    for r in rows:
        if "status" in r:
            print(r["slug"], "MISSING")
            continue
        print(
            "%-20s bg=#%02x%02x%02x  bgShare=%.3f  ink=%.3f  satColours=%3d  uniq=%4d" % (
                r["slug"], *r["background"], r["backgroundShare"], r["inkShare"],
                r["saturatedColours"], r["uniqueColours"],
            )
        )
    os.makedirs("artifacts/v2-source", exist_ok=True)
    with open("artifacts/v2-source/design-metrics.json", "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
