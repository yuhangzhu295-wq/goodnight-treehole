#!/usr/bin/env python3
"""Compare the current app's screenshots against the V2 designs on the same measurable axes.

A page is over-decorated when its ink share and saturated-colour count sit far above the design's,
because that gap is exactly what the audit described in prose. Measuring it turns "remove the
mascot" into a number that can be checked after the change.

Writes artifacts/v2-source/current-vs-design.json.
"""
import json
import os
import sys
from collections import Counter

from PIL import Image

DESIGN_DIR = r"C:\Users\zyu33\Downloads\V2 完整交付包\设计图"
SHOT_DIR = "artifacts/ui-screenshots"


def metrics(path):
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        # Sample the middle band only: the phone's status bar and the tab bar are chrome that the
        # static designs do not draw, and they would otherwise dominate the numbers.
        small = rgb.crop((0, int(h * 0.08), w, int(h * 0.92))).resize((w // 4, h // 4))
        px = list(small.getdata())
    total = len(px)
    counts = Counter(px)
    bg = counts.most_common(1)[0][0]
    near = sum(1 for p in px if all(abs(p[i] - bg[i]) <= 10 for i in range(3)))
    sat = sum(1 for p in counts if max(p) - min(p) > 40)
    return {
        "size": [w, h],
        "backgroundShare": round(near / total, 4),
        "inkShare": round(1 - near / total, 4),
        "saturatedColours": sat,
    }


def main():
    with open("artifacts/v2-source/audit-pages.json", encoding="utf-8") as fh:
        pages = json.load(fh)
    rows = []
    for p in pages:
        shot = os.path.join(SHOT_DIR, p["slug"] + ".png")
        design = os.path.join(DESIGN_DIR, p["design"]) if p["design"] else None
        if not design or not os.path.exists(design) or not os.path.exists(shot):
            rows.append({"slug": p["slug"], "status": "missing"})
            continue
        d = metrics(design)
        s = metrics(shot)
        rows.append({
            "slug": p["slug"],
            "design": p["design"],
            "priority": p["priority"],
            "designInk": d["inkShare"],
            "shotInk": s["inkShare"],
            "inkDelta": round(s["inkShare"] - d["inkShare"], 4),
            "designSaturated": d["saturatedColours"],
            "shotSaturated": s["saturatedColours"],
            "shotBackground": s["backgroundShare"],
        })
    ok = [r for r in rows if "inkDelta" in r]
    by_pri = {"P1": [r for r in ok if r["priority"] == "P1"], "P2": [r for r in ok if r["priority"] == "P2"]}
    for pri, group in by_pri.items():
        if not group:
            continue
        avg = sum(abs(r["inkDelta"]) for r in group) / len(group)
        print("%s: %d pages, mean |ink delta| %.4f" % (pri, len(group), avg))
    worst = sorted(ok, key=lambda r: r["inkDelta"], reverse=True)[:10]
    print("largest ink excess (current heavier than the design):")
    for r in worst:
        print("  %-22s %+0.3f  (design %.3f -> shot %.3f)  sat %d->%d" % (
            r["slug"], r["inkDelta"], r["designInk"], r["shotInk"], r["designSaturated"], r["shotSaturated"]))
    os.makedirs("artifacts/v2-source", exist_ok=True)
    with open("artifacts/v2-source/current-vs-design.json", "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
