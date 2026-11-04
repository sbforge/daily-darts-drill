#!/usr/bin/env python3
"""Renders the raster artwork (PNG/WebP) in src/assets/brand/art from code.

Needs rsvg-convert and cwebp on the PATH. Run: python3 tools/make-art.py
"""
import math, os, subprocess, tempfile

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "brand", "art")
BG, PANEL, LINE, CHALK, DIM = "#060d12", "#0d1b23", "#1d3440", "#e6ecef", "#8aa1ab"
ACCENT, ACCENT_HI, PETROL, AMBER = "#22d3ee", "#67e8f9", "#1a9fae", "#f2c14e"
ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
# Board radii as a fraction of the outer double edge (regulation 170 mm).
R_BULL, R_OB, R_T0, R_T1, R_D0, R_NUM = 6.35 / 170, 15.9 / 170, 99 / 170, 107 / 170, 162 / 170, 1.17

DEFS = f"""
<filter id="glow" x="-400%" y="-400%" width="900%" height="900%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glowL" x="-600%" y="-600%" width="1300%" height="1300%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="blur12"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d6f78"/><stop offset=".35" stop-color="#e9f0f2"/><stop offset=".6" stop-color="#9fb0b8"/><stop offset="1" stop-color="#46565e"/></linearGradient>
<linearGradient id="silver" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfd9de"/><stop offset="1" stop-color="#8fa0a9"/></linearGradient>
<linearGradient id="flight" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0e7f8f"/><stop offset=".5" stop-color="{ACCENT_HI}"/><stop offset="1" stop-color="#0e7f8f"/></linearGradient>
<linearGradient id="flightAmber" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a87a1c"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#a87a1c"/></linearGradient>
<radialGradient id="stage" cx=".5" cy=".4" r=".85"><stop offset="0" stop-color="#123846"/><stop offset=".55" stop-color="#0a1c25"/><stop offset="1" stop-color="{BG}"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060d12" stop-opacity="0"/><stop offset="1" stop-color="#060d12" stop-opacity=".75"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
"""

def pt(r, a):  # a in degrees, 0 = top, clockwise
    return r * math.sin(math.radians(a)), -r * math.cos(math.radians(a))

def sector(r0, r1, a0, a1):
    x0, y0 = pt(r1, a0); x1, y1 = pt(r1, a1); x2, y2 = pt(r0, a1); x3, y3 = pt(r0, a0)
    return f"M{x0:.2f} {y0:.2f}A{r1:.2f} {r1:.2f} 0 0 1 {x1:.2f} {y1:.2f}L{x2:.2f} {y2:.2f}A{r0:.2f} {r0:.2f} 0 0 0 {x3:.2f} {y3:.2f}Z"

def board(cx, cy, R, rot=0, hot=(), dim=1.0, numbers=True, wire=True, backing=True, soft=()):
    """hot: set of (number, ring) with ring in single|treble|double|bull|obull to light up in the accent colour."""
    g = [f'<g transform="translate({cx} {cy}) rotate({rot})">']
    if backing:
        g.append(f'<circle r="{R*1.32:.1f}" fill="#04090c"/><circle r="{R*1.27:.1f}" fill="none" stroke="{LINE}" stroke-width="{R*.012:.1f}"/>')
        g.append(f'<circle r="{R*1.2:.1f}" fill="#081217"/>')
    for i, n in enumerate(ORDER):
        a0, a1 = i * 18 - 9, i * 18 + 9
        dark = i % 2 == 0
        single = "#0b1419" if dark else "#173039"
        ring = "#0d5662" if dark else "#0a3440"
        def fill(ringname, base):
            return ACCENT if (n, ringname) in hot else base
        for name, r0, r1, base in (("single", R_OB, R_T0, single), ("treble", R_T0, R_T1, ring),
                                    ("single", R_T1, R_D0, single), ("double", R_D0, 1.0, ring)):
            lit = (n, name) in hot and not (name == "single" and ((n, "single") not in hot))
            f = ACCENT if lit else base
            op = 1 if lit else dim
            flt = ' filter="url(#glow)"' if lit else ""
            g.append(f'<path d="{sector(r0*R, r1*R, a0, a1)}" fill="{f}" opacity="{op}"{flt}/>')
        if n in soft:
            g.append(f'<path d="{sector(R_OB*R, R, a0, a1)}" fill="{ACCENT}" opacity=".26"/>')
        if numbers:
            x, y = pt(R * 1.095, i * 18)
            lit = any(h[0] == n for h in hot) or n in soft
            g.append(f'<text x="{x:.1f}" y="{y:.1f}" transform="rotate({-rot} {x:.1f} {y:.1f})" fill="{ACCENT_HI if lit else CHALK}" fill-opacity="{1 if lit else .55*dim}" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="{R*.105:.1f}" text-anchor="middle" dominant-baseline="central">{n}</text>')
    if wire:
        w = R * .0045
        for i in range(20):
            x0, y0 = pt(R_OB * R, i * 18 - 9); x1, y1 = pt(R, i * 18 - 9)
            g.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="#7fa3b0" stroke-opacity=".35" stroke-width="{w:.2f}"/>')
        for r in (R_OB, R_T0, R_T1, R_D0, 1.0, R_BULL):
            g.append(f'<circle r="{r*R:.1f}" fill="none" stroke="#7fa3b0" stroke-opacity=".35" stroke-width="{w:.2f}"/>')
    ob = ACCENT if (0, "obull") in hot else "#0d5662"
    bl = ACCENT_HI if (0, "bull") in hot else "#12a9bb"
    g.append(f'<circle r="{R_OB*R:.1f}" fill="{ob}" opacity="{1 if (0,"obull") in hot else dim}"/>')
    g.append(f'<circle r="{R_BULL*R:.1f}" fill="{bl}"' + (' filter="url(#glowL)"' if (0, "bull") in hot else f' opacity="{dim}"') + '/>')
    g.append(f'<circle r="{R_OB*R:.1f}" fill="none" stroke="#7fa3b0" stroke-opacity=".4" stroke-width="{R*.0045:.2f}"/>')
    g.append('</g>')
    return "".join(g)

def dart(x, y, angle=0, s=1.0, flight="flight", shadow=True):
    """Tip at (x, y); body trails away. angle 0 = pointing down onto the board (body above)."""
    sh = (f'<g opacity=".5" filter="url(#blur12)" transform="translate(12 10)"><path d="M-11 -150h22v110h-22z M0 -190l30 -110h-60z" fill="#000"/></g>' if shadow else "")
    body = f"""
    <path d="M-1.6 0h3.2l3.2 -44h-9.6z" fill="#cdd8dd"/>
    <rect x="-11.5" y="-150" width="23" height="110" rx="7" fill="url(#steel)"/>
    {''.join(f'<rect x="-11.5" y="{-142 + i*9}" width="23" height="2" fill="#0b1419" opacity=".35"/>' for i in range(11))}
    <rect x="-4" y="-205" width="8" height="58" rx="3" fill="#cdd8dd"/>
    <path d="M0 -190 L-34 -222 L-30 -300 L0 -262 L30 -300 L34 -222 Z" fill="url(#{flight})"/>
    <path d="M0 -190 L0 -262" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <path d="M0 -190 L-34 -222 L-30 -300 L0 -262Z" fill="#000" opacity=".12"/>
    """
    return f'<g transform="translate({x} {y}) rotate({angle}) scale({s})">{sh}{body}</g>'

def stage(w, h, glow=((.5, .35, ACCENT, .18),)):
    s = f'<rect width="{w}" height="{h}" fill="url(#stage)"/>'
    for gx, gy, col, op in glow:
        s += f'<ellipse cx="{gx*w:.0f}" cy="{gy*h:.0f}" rx="{w*.45:.0f}" ry="{h*.4:.0f}" fill="{col}" opacity="{op}" filter="url(#blur30)"/>'
    return s

def finish(w, h):
    return (f'<rect width="{w}" height="{h}" fill="url(#vig)"/>'
            f'<rect width="{w}" height="{h}" filter="url(#grain)" opacity=".07" style="mix-blend-mode:overlay"/>')

def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{DEFS}</defs>{body}</svg>'

def render(name, w, h, body, fmt="webp", q=88):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        s, png = os.path.join(t, "a.svg"), os.path.join(t, "a.png")
        open(s, "w").write(svg(w, h, body))
        subprocess.run(["rsvg-convert", s, "-o", png], check=True)
        dst = os.path.join(OUT, f"{name}.{fmt}")
        if fmt == "png":
            os.replace(png, dst)
        else:
            subprocess.run(["cwebp", "-quiet", "-q", str(q), png, "-o", dst], check=True)
    print("wrote", dst)


FONT = 'font-family="Helvetica Neue, Helvetica, Arial" font-weight="700"'
D_PATH = "M0 0H44A50 50 0 0 1 44 100H0ZM24 24V76H44A26 26 0 0 0 44 24Z"
THREE_PATH = "M108 8H128L116 24A15 15 0 1 1 106 46"

def motto_svg(cx, y, size=52, spacing=18, gap=None):
    """TRAIN. PLAY. FAIL. IMPROVE. with explicit gaps, since SVG collapses spaces."""
    gap = gap if gap is not None else size * .75
    words = [("TRAIN.", ACCENT), ("PLAY.", CHALK), ("FAIL.", CHALK), ("IMPROVE.", ACCENT)]
    spans = "".join(f'<tspan fill="{c}"' + (f' dx="{gap:.0f}"' if i else "") + f'>{w}</tspan>' for i, (w, c) in enumerate(words))
    return f'<text x="{cx}" y="{y}" text-anchor="middle" {FONT} font-size="{size}" letter-spacing="{spacing}" filter="url(#glow)">{spans}</text>'

def wordmark_svg(cx, y, size=92, spacing=30):
    return f'<text x="{cx}" y="{y}" text-anchor="middle" fill="{CHALK}" {FONT} font-size="{size}" letter-spacing="{spacing}">DAILY DARTS DRILL</text>'

def mark_svg(x, y, k):
    return f"""<g transform="translate({x:.0f} {y:.0f}) scale({k})">
      <path d="{D_PATH}" fill="#000" opacity=".6" transform="translate(2 5)" filter="url(#blur12)"/>
      <path d="{D_PATH}" fill="url(#silver)" fill-rule="evenodd"/>
      <path d="M0 0H44A50 50 0 0 1 94 50" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"/>
      <circle cx="44" cy="50" r="12" fill="{ACCENT}" opacity=".35" filter="url(#glow)"/>
      <circle cx="44" cy="50" r="7" fill="{ACCENT_HI}" filter="url(#glow)"/>
      <path d="{THREE_PATH}" fill="none" stroke="{ACCENT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
    </g>"""

def singles():
    """Transparent PNGs of the pieces on their own, for use over any background."""
    render("motto", 1800, 200, motto_svg(900, 120), fmt="png")
    render("wordmark", 1800, 200, wordmark_svg(900, 135), fmt="png")
    for word, col in (("TRAIN", ACCENT), ("PLAY", CHALK), ("FAIL", CHALK), ("IMPROVE", ACCENT)):
        t = (f'<text x="600" y="140" text-anchor="middle" fill="{col}" {FONT} font-size="110" letter-spacing="30" filter="url(#glow)">{word}.</text>')
        render(f"motto-{word.lower()}", 1200, 220, t, fmt="png")
    k = 5.0
    render("mark", 900, 700, mark_svg(100, 100, k), fmt="png")
    render("mark-dart", 1120, 920, mark_svg(320, 320, k) + dart(320 + 44 * k, 320 + 50 * k, -50, 1.3), fmt="png")

# ---------- backdrop ----------
def backdrop():
    w, h = 2400, 1500
    b = stage(w, h, ((.78, .55, ACCENT, .16), (.2, .9, PETROL, .10)))
    b += board(1750, 780, 760, rot=-6, dim=.55)
    b += f'<circle cx="1750" cy="780" r="{760*1.32:.0f}" fill="none" stroke="{ACCENT}" stroke-opacity=".25" stroke-width="3"/>'
    b += finish(w, h)
    render("backdrop", w, h, b, q=82)

# ---------- app icon ----------
def app_icon():
    s = 1024
    d = "M0 0H44A50 50 0 0 1 44 100H0ZM24 24V76H44A26 26 0 0 0 44 24Z"
    three = "M108 8H128L116 24A15 15 0 1 1 106 46"
    b = f"""
    <defs><linearGradient id="ib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14323f"/><stop offset="1" stop-color="#050b0f"/></linearGradient>
    <clipPath id="sq"><rect x="64" y="64" width="896" height="896" rx="210"/></clipPath>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{ACCENT}" stop-opacity=".7"/><stop offset=".4" stop-color="{LINE}"/><stop offset="1" stop-color="#0a1a22"/></linearGradient></defs>
    <rect x="64" y="86" width="896" height="896" rx="210" fill="#000" opacity=".5" filter="url(#blur30)"/>
    <rect x="64" y="64" width="896" height="896" rx="210" fill="url(#ib)"/>
    <g clip-path="url(#sq)">
      <ellipse cx="512" cy="540" rx="380" ry="320" fill="{ACCENT}" opacity=".14" filter="url(#blur30)"/>
      {board(512, 560, 340, rot=-3, dim=.3, numbers=False, backing=False)}
      <rect x="64" y="64" width="896" height="896" fill="url(#vig)"/>
    </g>
    <rect x="66" y="66" width="892" height="892" rx="208" fill="none" stroke="url(#rim)" stroke-width="4"/>
    <g transform="translate(198 338) scale(4.5)">
      <path d="{d}" fill="#000" opacity=".55" transform="translate(2 5)" filter="url(#blur12)"/>
      <path d="{d}" fill="url(#silver)" fill-rule="evenodd"/>
      <path d="M0 0H44A50 50 0 0 1 94 50" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>
      <circle cx="44" cy="50" r="12" fill="{ACCENT}" opacity=".35" filter="url(#glow)"/>
      <circle cx="44" cy="50" r="7" fill="{ACCENT_HI}" filter="url(#glow)"/>
      <path d="{three}" fill="none" stroke="{ACCENT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
    </g>
    """
    render("app-icon", s, s, b, fmt="png")


# ---------- hero / splash: mark, name and motto ----------
def hero(name="hero", w=2400, h=1500, motto=True):
    d = "M0 0H44A50 50 0 0 1 44 100H0ZM24 24V76H44A26 26 0 0 0 44 24Z"
    three = "M108 8H128L116 24A15 15 0 1 1 106 46"
    k = 6.2                      # mark scale
    mx, my = w / 2 - 70 * k, h * .40 - 50 * k   # mark origin so the D3 is centred
    b = stage(w, h, ((.5, .38, ACCENT, .20), (.5, 1.0, PETROL, .10)))
    b += board(w / 2, h * .40, 560, rot=-4, dim=.38, numbers=False, backing=False)
    b += mark_svg(mx, my, k)
    b += dart(mx + 44 * k, my + 50 * k, -52, 1.5)          # lands in the bull of the D
    ty = h * .40 + 50 * k + 150
    b += wordmark_svg(w / 2, round(ty))
    if motto:
        ly = ty + 62
        b += f'<g transform="translate({w/2} {ly:.0f})"><rect x="-520" y="0" width="1040" height="3" rx="1.5" fill="{ACCENT}" opacity=".85" filter="url(#glow)"/></g>'
        b += motto_svg(w / 2, round(ly + 96))
    b += finish(w, h)
    render(name, w, h, b, q=88)


# ---------- routine card art (tinted per routine in CSS via hue-rotate; the base hue is the accent cyan) ----------
def routine_card(w=1080, h=600):
    b = stage(w, h, ((.78, .45, ACCENT, .22), (.1, 1.0, PETROL, .10)))
    b += board(w * .80, h * .40, 440, rot=-3, hot={(20, "double"), (20, "treble")}, dim=.6)
    b += f'<circle cx="{w*.80}" cy="{h*.40}" r="{440*1.32:.0f}" fill="none" stroke="{ACCENT}" stroke-opacity=".3" stroke-width="3"/>'
    b += f'<rect y="{h-170}" width="{w}" height="170" fill="url(#fade)"/>'
    b += finish(w, h)
    render("routine-card", w, h, b, q=86)

# ---------- game illustrations ----------
W, H = 800, 500
def card(body_fn, name, glow=((.5, .4, ACCENT, .18),)):
    render(f"game-{name}", W, H, stage(W, H, glow) + body_fn() + finish(W, H), q=86)

def g_warm_up():
    b = board(400, 300, 290, rot=8, dim=.7, numbers=False)
    for x, y, a, s in ((270, 290, -12, .7), (480, 400, 9, .7), (410, 250, 3, .7), (540, 300, 16, .7), (320, 410, -18, .7)):
        b += dart(x, y, a, s, "flightAmber")
    return b
def g_121():
    b = board(650, 270, 440, rot=0, hot={(0, "bull")}, dim=.55, numbers=False)
    b += dart(652, 268, 24, 1.0)
    b += f'<text x="70" y="290" fill="{CHALK}" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="150" letter-spacing="-4">121</text>'
    b += f'<rect x="74" y="316" width="150" height="8" rx="4" fill="{ACCENT}" filter="url(#glow)"/>'
    return b
def g_atc():
    hot = {(n, "single") for n in ORDER[:0]}
    b = board(400, 250, 196, rot=0, hot={(8, "double"), (8, "treble")}, dim=.8, soft={20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16})
    # progress arc round the board
    r = 196 * 1.34
    x1, y1 = pt(r, -9); x2, y2 = pt(r, 14 * 18 + 9)
    b += f'<path transform="translate(400 250)" d="M{x1-0:.1f} {y1-0:.1f}A{r:.1f} {r:.1f} 0 1 1 {x2:.1f} {y2:.1f}" fill="none" stroke="{ACCENT}" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/>'
    return b
def g_simple_doubles():
    i = ORDER.index(16)
    b = board(400, 960, 640, rot=-i * 18, hot={(16, "double")}, dim=.6)
    b += dart(400, 960 - 640 * .975, 32, 1.0)
    return b
def g_complex_doubles():
    i = ORDER.index(16)
    b = board(400, 960, 640, rot=-(i + .5) * 18, hot={(16, "double"), (8, "double")}, dim=.6)
    x, y = pt(640 * .975, -9)
    return b + dart(400 + x, 960 + y, 32, 1.0)
def g_scoring():
    b = board(400, 760, 800, rot=0, hot={(20, "treble")}, dim=.6)
    for x, y, a in ((383, 285, -6), (418, 290, 7), (400, 262, 1)):
        b += dart(x, y + 20, a, .95)
    return b


# ---- the v1 games
def _label(text, x, y, size, anchor="start"):
    return f'<text x="{x}" y="{y}" fill="{CHALK}" {FONT} font-size="{size}" letter-spacing="-3" text-anchor="{anchor}">{text}</text>'
def _bar(x, y, w=150):
    return f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{ACCENT}" filter="url(#glow)"/>'

def g_catch_40():
    b = board(650, 270, 440, rot=0, hot={(20, "double"), (20, "treble")}, dim=.55, numbers=False)
    b += dart(560, 120, 20, 1.0)
    b += _label("61–100", 60, 290, 110) + _bar(64, 316)
    return b
def g_wild_card():
    b = board(650, 270, 440, rot=18, hot={(7, "double"), (16, "double"), (11, "treble")}, dim=.5, numbers=False)
    b += _label("?", 120, 330, 260) + _bar(64, 360, 120)
    return b
def g_bobs_27():
    i = ORDER.index(14)
    b = board(400, 960, 640, rot=-i * 18, hot={(14, "double")}, dim=.6)
    b += dart(400, 960 - 640 * .975, 32, 1.0)
    b += _label("27", 70, 120, 120)
    return b
def g_bull_x():
    b = board(400, 250, 300, rot=0, hot={(0, "bull"), (0, "obull")}, dim=.5, numbers=False)
    b += dart(402, 252, 18, 1.0)
    b += _label("×", 650, 330, 220, "middle")
    return b
def g_big_fish():
    b = board(650, 270, 440, rot=0, hot={(0, "bull"), (20, "treble")}, dim=.55, numbers=False)
    b += dart(652, 268, 24, 1.0)
    b += _label("170", 60, 290, 150) + _bar(64, 316)
    return b
def g_solo_leg():
    b = board(650, 270, 440, rot=0, hot={(20, "double")}, dim=.55, numbers=False)
    b += _label("501", 60, 290, 150) + _bar(64, 316)
    return b
def g_jdc():
    # Shanghai: single, double and treble of one number lit, three darts in it.
    i = ORDER.index(15)
    b = board(650, 270, 440, rot=-i * 18, hot={(15, "single"), (15, "double"), (15, "treble")}, dim=.55, numbers=False)
    b += _label("JDC", 60, 290, 130) + _bar(64, 316)
    return b

if __name__ == "__main__":
    backdrop(); app_icon(); hero(); singles(); routine_card()
    card(g_warm_up, "warm-up", ((.5, .5, AMBER, .16),))
    card(g_121, "121"); card(g_atc, "around-the-clock")
    card(g_simple_doubles, "simple-doubles"); card(g_complex_doubles, "complex-doubles"); card(g_scoring, "scoring")
    for fn, name in ((g_catch_40, "catch-40"), (g_wild_card, "wild-card"), (g_bobs_27, "bobs-27"), (g_bull_x, "bull-x"),
                     (g_big_fish, "big-fish"), (g_solo_leg, "solo-leg"), (g_jdc, "jdc-challenge")):
        card(fn, name)
