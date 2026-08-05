# -*- coding: utf-8 -*-
"""Generate icons/*.svg — one map pin per selectable icon.

Each file is a 24x32 teardrop pin filled with `currentColor` (the type colour,
substituted at load time by js/icons.js) with a white glyph knocked into it.
Glyphs are authored in a 12x12 local box and translated into the pin head.

Run:  python tools/make_icons.py
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

PIN = ("M12 1.2C6.62 1.2 2.26 5.56 2.26 10.94c0 6.9 8.32 18.5 8.68 18.99a1.32 1.32 0 0 0 2.12 0"
       "c.36-.49 8.68-12.09 8.68-18.99C21.74 5.56 17.38 1.2 12 1.2z")

GLYPHS = {
    # ── 숙소 stay ────────────────────────────────────────────────────────────
    "lodging": """
      <rect x="0" y="3.2" width="1.5" height="6.6" rx=".5"/>
      <path d="M2.2 5h5.2a3.1 3.1 0 0 1 3.1 3.1v.1H2.2z"/>
      <rect x="0" y="8.2" width="12" height="1.6" rx=".6"/>
      <rect x="10.5" y="8.2" width="1.5" height="3" rx=".5"/>
      <rect x="0" y="8.2" width="1.5" height="3" rx=".5"/>""",
    "home": """
      <path d="M6 .8.3 5.7h1.6v5.5h3V7.5h2.2v3.7h3V5.7h1.6z"/>""",
    "campsite": """
      <path fill-rule="evenodd" d="M6 .9.4 11.2h11.2zm0 3.6L3.5 11.2h5z"/>""",
    "suitcase": """
      <path d="M4.1 3.5V2.3A1.3 1.3 0 0 1 5.4 1h1.2a1.3 1.3 0 0 1 1.3 1.3v1.2H6.7V2.2H5.3v1.3z"/>
      <path fill-rule="evenodd" d="M.6 4.1h10.8v6.7H.6zm4.7 1.5v3.7h1.4V5.6z"/>""",
    "star": """
      <path d="M6 .5 7.75 4.3l4.15.5-3.07 2.85.82 4.1L6 9.7l-3.65 2.05.82-4.1L.1 4.8l4.15-.5z"/>""",

    # ── 관광 명소 sight ──────────────────────────────────────────────────────
    "castle": """
      <path fill-rule="evenodd" d="M.6 11.2V3.9h1.4V2.5h1.4v1.4h1.5V2.5h1.4v1.4h1.5V2.5h1.4v1.4h1.4v7.3H7.3V8.5a1.3 1.3 0 0 0-2.6 0v2.7z"/>""",
    "museum": """
      <path d="M6 .9.5 3.7v1.2h11V3.7z"/>
      <rect x="1.7" y="5.7" width="1.5" height="4.1"/>
      <rect x="5.25" y="5.7" width="1.5" height="4.1"/>
      <rect x="8.8" y="5.7" width="1.5" height="4.1"/>
      <rect x="0.5" y="10.4" width="11" height="1.4" rx=".35"/>""",
    "art-gallery": """
      <path fill-rule="evenodd" d="M.6 1.3h10.8v9.4H.6zm1.4 1.4v6.6h8V2.7z"/>
      <path d="M2.6 8.7 4.75 5.9l1.6 1.9 1.6-1.7 1.45 2.6z"/>
      <circle cx="3.6" cy="4.3" r=".95"/>""",
    "park": """
      <path d="M6 .8 2.1 6.5h1.95L1.1 10.2h9.8L7.95 6.5H9.9z"/>
      <rect x="5.2" y="9.6" width="1.6" height="2.1" rx=".35"/>""",
    "temple": """
      <path d="M6 .7.9 3.4h10.2zM2 4.3h8l1.5 2.1H.5zM3 7.2h6l1.3 2.2H1.7z"/>
      <rect x="5.1" y="9.9" width="1.8" height="1.7"/>""",
    "church": """
      <path d="M5.2.4h1.6V2h1.6v1.6H6.8v7.9H5.2V3.6H3.6V2h1.6z"/>
      <path d="M2 5.2.5 7.3v4.2h2.9V7.3zM10 5.2 8.6 7.3v4.2h2.9V7.3z"/>""",
    "mountain": """
      <path d="M.3 10.6 4.5 2.7l2.35 4.1 1.25-1.6 3.6 5.4z"/>
      <path d="M4.5 2.7 3.1 5.35l1.4-.6 1.35.85z" fill="#fff"/>""",
    "beach": """
      <circle cx="9.1" cy="2.5" r="2.1"/>
      <path d="M.3 6.6c1.14 0 1.14 1 2.28 1s1.14-1 2.28-1 1.14 1 2.28 1 1.14-1 2.28-1 1.14 1 2.28 1v1.5c-1.14 0-1.14-1-2.28-1s-1.14 1-2.28 1-1.14-1-2.28-1-1.14 1-2.28 1S1.44 8.1.3 8.1z"/>
      <path d="M.3 9.3c1.14 0 1.14 1 2.28 1s1.14-1 2.28-1 1.14 1 2.28 1 1.14-1 2.28-1 1.14 1 2.28 1v1.5c-1.14 0-1.14-1-2.28-1s-1.14 1-2.28 1-1.14-1-2.28-1-1.14 1-2.28 1S1.44 10.8.3 10.8z"/>""",
    "viewpoint": """
      <path d="M2.3 1.9h2.5l.7 2.4H1.6zM7.2 1.9h2.5l.7 2.4H6.5z"/>
      <rect x="5" y="4.6" width="2" height="2.4"/>
      <circle cx="3" cy="7.9" r="2.9"/><circle cx="9" cy="7.9" r="2.9"/>""",
    "zoo": """
      <circle cx="2.7" cy="3.4" r="1.55"/><circle cx="6.2" cy="2.1" r="1.6"/>
      <circle cx="9.6" cy="3.9" r="1.45"/><circle cx="1.5" cy="7.1" r="1.4"/>
      <path d="M6.3 5.1c2.1 0 3.9 2 3.9 3.9 0 1.35-1.05 2.1-2.3 2.1-.65 0-1.05-.3-1.6-.3s-.95.3-1.6.3c-1.25 0-2.3-.75-2.3-2.1 0-1.9 1.8-3.9 3.9-3.9z"/>""",
    "aquarium": """
      <path fill-rule="evenodd" d="M.3 6c1.85-2.85 4.7-3.65 6.7-3.65 1.62 0 3.05.82 3.96 2.05l1.04-1.3v5.8l-1.04-1.3A4.73 4.73 0 0 1 7 9.65C5 9.65 2.15 8.85.3 6zm3.15-.85a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7z"/>""",
    "monument": """
      <path d="M6 .6 4.2 3.5v5.4h3.6V3.5z"/>
      <rect x="2.6" y="9.1" width="6.8" height="1.2"/>
      <rect x="1.4" y="10.5" width="9.2" height="1.3" rx=".3"/>""",

    # ── 현지 맛집 food ───────────────────────────────────────────────────────
    "restaurant": """
      <path d="M1.7.5v3.7a1.75 1.75 0 0 0 1.15 1.64v5.85h1.3V5.84A1.75 1.75 0 0 0 5.3 4.2V.5H4.25v3.15h-.75V.5H2.45v3.15H1.7z" transform="translate(0)"/>
      <path d="M9.55.5c-1.1.85-1.75 2.3-1.75 3.95 0 1.25.55 2.1 1.3 2.4v4.84h1.35V.5z"/>""",
    "noodle": """
      <path d="M.6 5.7h10.8a5.4 5.4 0 0 1-10.8 0z"/>
      <rect x="0" y="10.4" width="12" height="1.4" rx=".5"/>
      <path d="M2.9 4.6c-.9-1.3-.7-2.3.2-3.4l1 .8c-.55.7-.6 1.1-.05 1.85zM6.4 4.6c-.9-1.3-.7-2.3.2-3.4l1 .8c-.55.7-.6 1.1-.05 1.85z"/>""",
    "pizza": """
      <path fill-rule="evenodd" d="M6 .4 11.7 11.6H.3zM5.1 4.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2.4 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>""",
    # 가리비 껍데기 — 부챗살 홈을 evenodd 로 파내야 '조개'로 읽힌다.
    "seafood": """
      <path fill-rule="evenodd" d="M6 1c3.05 0 5.5 2.45 5.5 5.5 0 .9-.2 1.75-.55 2.5-.5-.65-1-1-1.55-1-.6 0-1.1.4-1.6 1.05C7.3 8.4 6.8 8 6.2 8s-1.1.4-1.6 1.05C4.1 8.4 3.6 8 3 8c-.55 0-1.05.35-1.55 1A6 6 0 0 1 .5 6.5C.5 3.45 2.95 1 6 1zm-.55 1.7L3.9 7.05a2 2 0 0 1 .75.5l1.1-4.6a4 4 0 0 0-.3-.25zm1.6.05-.35.2 1.1 4.6a2 2 0 0 1 .75-.5zm2.2 1.2-.7.45 1.5 3.05q.28-.24.6-.35zM3.45 4.9l-.72-.42-1.36 3.2q.32.1.6.34z"/>
      <path d="M5.2 9.9h1.6l-.8 1.5z"/>""",
    "fast-food": """
      <path d="M.9 3.9C.9 2.1 3.2.7 6 .7s5.1 1.4 5.1 3.2z"/>
      <rect x="0.5" y="5" width="11" height="1.7" rx=".5"/>
      <path d="M.9 8.1h10.2c0 1.75-1.05 2.9-2.55 2.9H3.45C1.95 11 .9 9.85.9 8.1z"/>""",
    "cafe": """
      <path d="M1.3 1.8h7.3v4.6a3.65 3.65 0 0 1-7.3 0z"/>
      <path d="M9.4 2.9h.9a1.95 1.95 0 0 1 0 3.9h-.9V5.4h.9a.75.75 0 0 0 0-1.5h-.9z"/>
      <rect x="0.9" y="10" width="8.1" height="1.5" rx=".5"/>""",
    "bakery": """
      <path d="M1.1 4.5c0-2.05 1.95-3.3 4.9-3.3s4.9 1.25 4.9 3.3c0 .85-.6 1.3-1.25 1.3v3.5c0 .95-.75 1.5-1.7 1.5H4.05c-.95 0-1.7-.55-1.7-1.5V5.8C1.7 5.8 1.1 5.35 1.1 4.5z"/>""",
    "ice-cream": """
      <path d="M6 .6a3.25 3.25 0 0 0-3.25 3.25c0 .3.04.6.12.87h6.26c.08-.27.12-.57.12-.87A3.25 3.25 0 0 0 6 .6z"/>
      <path d="M2.85 5.9h6.3L6 11.5z"/>""",
    "bar": """
      <path d="M.7 1.1h10.6L6.75 6.35v3.75h2.5v1.4H2.75v-1.4h2.5V6.35z"/>""",

    # ── 엑티비티 activity ────────────────────────────────────────────────────
    "amusement-park": """
      <g fill="none" stroke="#fff" stroke-width="1.05">
        <circle cx="6" cy="4.6" r="3.95"/>
        <path d="M6 .65v7.9M2.05 4.6h7.9M3.2 1.8l5.6 5.6M8.8 1.8 3.2 7.4"/>
      </g>
      <circle cx="6" cy="4.6" r="1.15"/>
      <path d="M5.25 8.3h1.5l2.1 3.3H7.15L6 9.75 4.85 11.6H3.15z"/>""",
    "swimming": """
      <circle cx="3.2" cy="2.1" r="1.6"/>
      <path d="M5.1 3.1 8 5.35 6.7 6.9 4.65 5.3 2.9 6.9 1.7 5.7z"/>
      <path d="M.3 8c1.14 0 1.14 1 2.28 1s1.14-1 2.28-1 1.14 1 2.28 1 1.14-1 2.28-1 1.14 1 2.28 1v1.5c-1.14 0-1.14-1-2.28-1s-1.14 1-2.28 1-1.14-1-2.28-1-1.14 1-2.28 1S1.44 9.5.3 9.5z"/>""",
    "bicycle": """
      <g fill="none" stroke="#fff" stroke-width="1.1">
        <circle cx="2.8" cy="8.3" r="2.55"/><circle cx="9.2" cy="8.3" r="2.55"/>
        <path d="M2.8 8.3 5.3 3.5h2.3l1.6 4.8M4.5 3.5h2.1"/>
      </g>
      <circle cx="8.6" cy="1.9" r="1.25"/>""",
    "skiing": """
      <circle cx="8" cy="1.7" r="1.4"/>
      <path d="M6.85 3.5 3.9 5.3l1.15 2.15L2.3 8.9l.75 1.35 4.05-2.2-1.05-1.95 1.75-1.05 1.9 3.2 1.4-.85L8.6 3.6z"/>
      <rect x="0.4" y="10.2" width="11.2" height="1.3" rx=".45"/>""",
    "golf": """
      <rect x="3.3" y=".6" width="1.3" height="9.3" rx=".3"/>
      <path d="M4.6 1.2 10.5 3.5 4.6 5.8z"/>
      <circle cx="8.5" cy="9.3" r="1.5"/>
      <path d="M.6 11.6c0-.85 2.4-1.55 5.4-1.55s5.4.7 5.4 1.55z"/>""",
    "theatre": """
      <path fill-rule="evenodd" d="M.7 1.4h10.6v4.5A5.3 5.3 0 0 1 .7 6zM3.5 3.2a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9zm5 0a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9z"/>
      <path d="M3.5 7.4h5c-.4 1.05-1.35 1.7-2.5 1.7s-2.1-.65-2.5-1.7z"/>
      <rect x="0.7" y="10.2" width="10.6" height="1.4" rx=".45"/>""",
    "cinema": """
      <path d="M.6 1.5 11.4.6v2.7L.6 4.2z"/>
      <path fill-rule="evenodd" d="M.6 4.9h10.8v6.1a.6.6 0 0 1-.6.6H1.2a.6.6 0 0 1-.6-.6zm4.6 1.5v3.3l3-1.65z"/>""",
    "shopping": """
      <path d="M6 .6a2.6 2.6 0 0 1 2.6 2.6H7.2A1.2 1.2 0 0 0 4.8 3.2H3.4A2.6 2.6 0 0 1 6 .6z"/>
      <path fill-rule="evenodd" d="M1.7 3.9h8.6l.9 7.7H.8zm2.4 1.6v1.4h3.8V5.5z"/>""",
    "fitness": """
      <rect x="0" y="4.2" width="1.9" height="3.6" rx=".6"/>
      <rect x="2.3" y="2.9" width="2.2" height="6.2" rx=".7"/>
      <rect x="4.6" y="5.1" width="2.8" height="1.8"/>
      <rect x="7.5" y="2.9" width="2.2" height="6.2" rx=".7"/>
      <rect x="10.1" y="4.2" width="1.9" height="3.6" rx=".6"/>""",
    "picnic": """
      <path fill="none" stroke="#fff" stroke-width="1.15" d="M3.3 4.6a2.7 2.7 0 0 1 5.4 0"/>
      <path fill-rule="evenodd" d="M.7 5.2h10.6l-1 6.4H1.7zm4.6 1.5v3.4h1.4V6.7z"/>""",
    # 그네 — 윗대·양쪽 다리·줄 두 가닥·앉는 판. 작게 줄여도 형태가 뭉치지 않는다.
    "playground": """
      <rect x="0.8" y="1.5" width="10.4" height="1.25" rx=".4"/>
      <path d="M1.7 2.75h1.3L2 11.3H.7zM9 2.75h1.3l1.3 8.55H10.3z"/>
      <rect x="4.25" y="2.75" width=".7" height="5.5"/>
      <rect x="7.05" y="2.75" width=".7" height="5.5"/>
      <rect x="3.5" y="8.15" width="5" height="1.15" rx=".35"/>""",
    "cruise": """
      <path d="M.7 7.7h10.6l-1.5 2.85c-.35.65-.95 1.05-1.7 1.05H3.9c-.75 0-1.35-.4-1.7-1.05z"/>
      <path fill-rule="evenodd" d="M2.4 3.4h7.2v3.6H2.4zm1.6 1a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zm4 0a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z"/>
      <rect x="5.2" y=".5" width="1.6" height="2.4"/>""",
}


def build(name, glyph):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="24" height="32" '
        f'role="img" aria-label="{name}">\n'
        f'  <path d="{PIN}" fill="currentColor" stroke="#ffffff" stroke-width="1.6" '
        'stroke-linejoin="round"/>\n'
        '  <g fill="#ffffff" transform="translate(6 5)">'
        + glyph.rstrip() + "\n  </g>\n</svg>\n"
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, glyph in GLYPHS.items():
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(build(name, glyph))
    print("wrote %d icons to %s" % (len(GLYPHS), OUT))


if __name__ == "__main__":
    main()
