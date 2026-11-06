#!/usr/bin/env python3
"""Confirm the design images and the app's real screenshots depict the same product.

A design package belonging to another app would make every comparison meaningless, so before any
page is worked on this measures each design against its matching screenshot. Both images are reduced
to a 32x32 luminance grid, which says something about layout mass and nothing about exact pixels:
an unrelated pair sits far apart, a same-product pair does not.

Writes artifacts/v2-source/design-vs-shot.json.
"""
import json
import os
import sys

from PIL import Image

DESIGN_DIR = r"C:\Users\zyu33\Downloads\V2 完整交付包\设计图"
SHOT_DIR = "artifacts/ui-screenshots"


def grid(path):
    with Image.open(path) as im:
        g = im.convert("L").resize((32, 32))
        return list(g.getdata()), im.size


def main():
    with open("artifacts/v2-source/audit-pages.json", encoding="utf-8") as fh:
        pages = json.load(fh)

    results = []
    for p in pages:
        shot = os.path.join(SHOT_DIR, p["slug"] + ".png")
        design = os.path.join(DESIGN_DIR, p["design"]) if p["design"] else None
        if not design or not os.path.exists(design) or not os.path.exists(shot):
            results.append({"slug": p["slug"], "design": p["design"], "status": "missing file"})
            continue
        d, dsize = grid(design)
        s, ssize = grid(shot)
        diff = sum(abs(a - b) for a, b in zip(d, s)) / len(d)
        # Horizontal ink profile correlation: how much the two images agree on where content sits.
        n = len(d)
        cols = [sum(d[r * 32 + c] for r in range(32)) / 32 for c in range(32)]
        scols = [sum(s[r * 32 + c] for r in range(32)) / 32 for c in range(32)]
        m1 = sum(cols) / 32
        m2 = sum(scols) / 32
        num = sum((cols[i] - m1) * (scols[i] - m2) for i in range(32))
        den = (sum((cols[i] - m1) ** 2 for i in range(32)) * sum((scols[i] - m2) ** 2 for i in range(32))) ** 0.5
        corr = (num / den) if den else 0.0
        results.append({
            "slug": p["slug"],
            "design": p["design"],
            "designSize": list(dsize),
            "shotSize": list(ssize),
            "meanLumaDiff": round(diff, 2),
            "columnProfileCorr": round(corr, 4),
        })

    ok = [r for r in results if "meanLumaDiff" in r]
    corrs = sorted(r["columnProfileCorr"] for r in ok)
    print("compared:", len(ok), "/", len(results))
    if ok:
        print("column-profile correlation: min %.4f median %.4f max %.4f" % (corrs[0], corrs[len(corrs) // 2], corrs[-1]))
        print("mean luminance diff: min %.2f max %.2f" % (
            min(r["meanLumaDiff"] for r in ok), max(r["meanLumaDiff"] for r in ok)))
        low = sorted(ok, key=lambda r: r["columnProfileCorr"])[:5]
        print("lowest correlation:", ", ".join("%s:%.4f" % (r["slug"], r["columnProfileCorr"]) for r in low))
    bad = [r["slug"] for r in results if "status" in r]
    print("missing:", ", ".join(bad) if bad else "none")

    os.makedirs("artifacts/v2-source", exist_ok=True)
    with open("artifacts/v2-source/design-vs-shot.json", "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
