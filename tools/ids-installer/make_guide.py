"""Kurulum sihirbazi icin numarali rehber resimleri: gercek chrome:// ve edge://extensions goruntusu + klasor penceresi cizimi.
Kullanim: guide.py <cikti klasoru>  -> ext_guide_<yuzde>.bmp ve ext_guide_edge_<yuzde>.bmp (100/125/150/200), onizleme png."""
import base64
import pathlib
import sys
import tempfile

from PIL import Image
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
CSS_W, CSS_H = 600, 150

with sync_playwright() as pw:
    # 1) Gercek Chrome, bos gecici profil, Turkce: Gelistirici modu acik halinin ust seridi (2x net)
    prof = tempfile.mkdtemp(prefix="ids_shot_")
    ctx = pw.chromium.launch_persistent_context(
        prof, channel="chrome", headless=True, locale="tr-TR",
        viewport={"width": 1000, "height": 400}, device_scale_factor=2, args=["--lang=tr", "--accept-lang=tr-TR"])
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("chrome://extensions/")
    page.wait_for_timeout(1200)
    page.locator("#devMode").click()
    page.wait_for_timeout(800)
    shot = page.screenshot(clip={"x": 0, "y": 0, "width": 1000, "height": 114})
    ctx.close()
    b64 = base64.b64encode(shot).decode()

    # Edge: anahtar sol altta, dugme sag ustte; iki parca yan yana gosterilir (2x net).
    prof = tempfile.mkdtemp(prefix="ids_shot_")
    ctx = pw.chromium.launch_persistent_context(
        prof, channel="msedge", headless=True, locale="tr-TR",
        viewport={"width": 1200, "height": 620}, device_scale_factor=2, args=["--lang=tr", "--accept-lang=tr-TR"])
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("edge://extensions/")
    page.wait_for_timeout(1500)
    page.mouse.click(269, 564)      # Gelistirici modu anahtari (sayfa kabuk DOM'unda, konumla tiklanir)
    page.wait_for_timeout(1000)
    edge_left = base64.b64encode(page.screenshot(clip={"x": 40, "y": 540, "width": 280, "height": 50})).decode()
    edge_right = base64.b64encode(page.screenshot(clip={"x": 790, "y": 98, "width": 410, "height": 46})).decode()
    ctx.close()

    html = f"""<!doctype html><meta charset="utf-8"><style>
    *{{box-sizing:border-box;margin:0}}
    body{{width:{CSS_W}px;height:{CSS_H}px;background:#F5F1EA;font-family:'Segoe UI',sans-serif;color:#15223B;padding:8px 10px;position:relative}}
    .win{{position:relative;border:1px solid #cfc6b8;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(21,34,59,.12)}}
    .bar{{height:20px;background:#e9e4dc;font-size:10.5px;display:flex;align-items:center;padding:0 8px;gap:6px;color:#4a5568}}
    .bar b{{background:#fff;border-radius:9px;padding:1px 10px;font-weight:500;color:#15223B}}
    .shot{{display:block;width:100%}}
    .ring{{position:absolute;border:2.5px solid #B87333;border-radius:20px}}
    .n{{position:absolute;width:22px;height:22px;border-radius:50%;background:#B87333;color:#fff;font-weight:700;font-size:13px;
        display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}}
    .dlg{{margin-top:8px;position:relative;border:1px solid #cfc6b8;border-radius:8px;background:#f3f3f3;padding:8px 10px;
        display:flex;align-items:center;gap:8px;font-size:12px}}
    .dlg .lbl{{color:#333}}
    .dlg .in{{flex:1;background:#fff;border:1px solid #8a8a8a;border-bottom:2px solid #005fb8;border-radius:4px;padding:3px 6px;
        font-family:Consolas,monospace;font-size:11.5px;white-space:nowrap;overflow:hidden}}
    .btn{{border-radius:4px;padding:4px 12px;font-size:12px;border:1px solid #bbb;background:#fdfdfd}}
    .btn.pri{{background:#005fb8;color:#fff;border-color:#005fb8}}
    .cap{{position:absolute;right:10px;top:-9px;background:#F5F1EA;padding:0 6px;font-size:10.5px;color:#6b5a45}}
    </style>
    <div class="win">
      <div class="bar">Chrome <b>chrome://extensions</b></div>
      <img class="shot" src="data:image/png;base64,{b64}">
    </div>
    <div class="ring" style="left:{10 + 846*0.578:.0f}px;top:{8 + 20 + 14*0.578:.0f}px;width:{150*0.578:.0f}px;height:{30*0.578:.0f}px"></div>
    <div class="n" style="left:{10 + 846*0.578 - 26:.0f}px;top:{8 + 20 + 14*0.578 - 3:.0f}px">2</div>
    <div class="ring" style="left:{10 + 20*0.578:.0f}px;top:{8 + 20 + 62*0.578:.0f}px;width:{192*0.578:.0f}px;height:{44*0.578:.0f}px"></div>
    <div class="n" style="left:{10 + 216*0.578:.0f}px;top:{8 + 20 + 69*0.578:.0f}px">3</div>
    <div class="dlg">
      <span class="cap">açılan "Klasör seç" penceresinin altı</span>
      <div class="n" style="position:static;flex:none">4</div>
      <span class="lbl">Klasör:</span><span class="in">C:\\Users\\Adınız\\AppData\\Local\\Programs\\IDS Yardimcisi\\eklenti</span>
      <span class="btn pri">Klasör seç</span><span class="btn">İptal</span>
    </div>"""

    # Ayni kalip, Edge parcalari: olcek 0.78; halka/numara konumlari parca basina gore (bkz. edge_left/right kirpimi).
    style = html[:html.index("</style>") + len("</style>")]
    dialog = html[html.index('<div class="dlg">'):]
    html_edge = style + f"""
    <div class="win">
      <div class="bar">Edge <b>edge://extensions</b></div>
      <div style="display:flex;gap:12px;align-items:center;background:#fff">
        <img src="data:image/png;base64,{edge_left}" style="display:block;width:218px;height:39px">
        <img src="data:image/png;base64,{edge_right}" style="display:block;width:320px;height:36px">
      </div>
    </div>
    <div class="ring" style="left:{10 + 165 - 3}px;top:{8 + 20 + 11 - 2}px;width:34px;height:20px"></div>
    <div class="n" style="left:{10 + 165 - 30}px;top:{8 + 20 + 9}px">2</div>
    <div class="ring" style="left:{10 + 218 + 12 + 19 - 3}px;top:{8 + 20 + 6 - 1}px;width:102px;height:27px"></div>
    <div class="n" style="left:{10 + 218 + 12 + 19 + 103}px;top:{8 + 20 + 9}px">3</div>
    {dialog}"""

    b = pw.chromium.launch(channel="chrome", headless=True)
    for prefix, body in (("ext_guide_", html), ("ext_guide_edge_", html_edge)):
        for pct in (100, 125, 150, 200):
            pg = b.new_page(viewport={"width": CSS_W, "height": CSS_H}, device_scale_factor=pct / 100)
            pg.set_content(body)
            pg.wait_for_timeout(300)
            png = out / f"{prefix}{pct}.png"
            pg.screenshot(path=str(png))
            Image.open(png).convert("RGB").save(out / f"{prefix}{pct}.bmp")
            pg.close()
    b.close()
print("ok")
