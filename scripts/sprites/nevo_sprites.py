"""
Pipeline de recorte dos sprites do Nevo (spec docs/specs/2026/q3/q3-3/sequencia-diaria-nevo.md).

A sheet mestre tem fundo borrado (não transparente) e legendas embaixo de cada
sprite. O recorte combina três coisas:

1. Máscara de um modelo de segmentação (ISNet via rembg) rodado POR SPRITE em 4x.
   Acerta a silhueta, mas deixa partes semitransparentes (sapato, luva, capa).
2. "Difference matte" contra o fundo reconstruído (inpaint + blur forte do que
   não é sprite). Como o fundo é baixa frequência, a diferença pixel a pixel
   solidifica o miolo. Ela só vale DENTRO da silhueta do modelo; fora dela puxa
   o brilho/sombra do render e cria halo.
3. Descontaminação de cor da borda: conhecendo o fundo B, a cor do sprite é
   F = (C - (1 - a) * B) / a. Tira a franja bege/cinza da borda.

Uso (Python 3.10+):
    python -m venv .venv && .venv/Scripts/pip install -r scripts/sprites/requirements.txt
    .venv/Scripts/python scripts/sprites/nevo_sprites.py all --sheet C:/TRABALHO/workflow/sprites-nevo.png

Subcomandos: mask | plate | cut | refine | export | contact | all
As caixas de cada sprite ficam em crops.py (x, y, w, h, limite inferior para não
pegar a legenda). Sheet nova = caixas novas.
"""
import argparse
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from crops import CROPS  # noqa: E402

UP, PAD = 4, 10
PARTICLES = {
    "comemorando", "fogo-animado-1", "fogo-animado-2", "fogo-animado-3", "fogo-particulas",
    "fogo-aura", "fogo-brilho", "extra-confete", "dormindo", "confuso", "com-raiva",
    "dando-dica", "seq-lendario",
}
# Ícones que o recorte estraga (o anel vira disco no preenchimento de buracos).
# No produto eles são SVG.
SKIP_EXPORT = {"ui-check", "ui-check-vazio", "ui-progresso"}


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def session(model):
    from rembg import new_session
    return new_session(model)


def crop_box(src, x, y, w, h, cap):
    return (max(0, x - PAD), max(0, y - PAD), min(src.width, x + w + PAD), min(cap, y + h + PAD))


def cmd_mask(a):
    """Máscara grosseira da sheet inteira (só alimenta o plate de fundo)."""
    from rembg import remove
    src = Image.open(a.sheet).convert("RGB")
    W, H = src.size
    sess = session(a.model)
    big = src.resize((W * 2, H * 2), Image.LANCZOS)
    mask = np.zeros((H * 2, W * 2), np.uint8)
    TS, OV = 1024, 128
    for y in range(0, H * 2, TS - OV):
        for x in range(0, W * 2, TS - OV):
            box = (x, y, min(x + TS, W * 2), min(y + TS, H * 2))
            m = np.array(remove(big.crop(box), session=sess, only_mask=True))
            sub = mask[box[1]:box[3], box[0]:box[2]]
            np.maximum(sub, m, out=sub)
    Image.fromarray(cv2.resize(mask, (W, H), interpolation=cv2.INTER_AREA)).save(f"{a.work}/mask_full.png")
    print("mask_full.png")


def cmd_plate(a):
    """Fundo reconstruído: pinta por cima do que é sprite/texto e borra forte."""
    src = cv2.imread(a.sheet)
    mask = cv2.imread(f"{a.work}/mask_full.png", 0)
    fg = cv2.dilate((mask > 12).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    small = cv2.resize(src, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    fgs = cv2.resize(fg, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    fgs = cv2.dilate(fgs, np.ones((5, 5), np.uint8))
    inp = cv2.GaussianBlur(cv2.inpaint(small, fgs, 12, cv2.INPAINT_TELEA), (0, 0), 6)
    plate = cv2.resize(inp, (src.shape[1], src.shape[0]), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(f"{a.work}/bgplate.png", plate)
    print("bgplate.png")


def cmd_cut(a):
    """Máscara do modelo por sprite, em 4x."""
    from rembg import remove
    src = Image.open(a.sheet).convert("RGB")
    sess = session(a.model)
    os.makedirs(f"{a.work}/masks", exist_ok=True)
    for name, (x, y, w, h, cap) in CROPS.items():
        box = crop_box(src, x, y, w, h, cap)
        big = src.crop(box).resize(((box[2] - box[0]) * UP, (box[3] - box[1]) * UP), Image.LANCZOS)
        remove(big, session=sess, only_mask=True, post_process_mask=False).save(f"{a.work}/masks/{name}.png")
        print("mask", name)


def cmd_refine(a):
    src = Image.open(a.sheet).convert("RGB")
    plate = Image.open(f"{a.work}/bgplate.png").convert("RGB")
    os.makedirs(f"{a.work}/final", exist_ok=True)
    for name, (x, y, w, h, cap) in CROPS.items():
        box = crop_box(src, x, y, w, h, cap)
        size = ((box[2] - box[0]) * UP, (box[3] - box[1]) * UP)
        img = np.array(src.crop(box).resize(size, Image.LANCZOS)).astype(np.float32)
        bg = np.array(plate.crop(box).resize(size, Image.BICUBIC)).astype(np.float32)
        m = np.array(Image.open(f"{a.work}/masks/{name}.png")).astype(np.float32) / 255.0

        diff = np.abs(cv2.GaussianBlur(img, (0, 0), 1.2) - bg).max(axis=2)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        near = cv2.dilate((m > 0.08).astype(np.uint8), kernel).astype(np.float32)
        al = np.maximum(smooth(m, 0.06, 0.45), smooth(diff, 30, 75) * near * (m > 0.02))

        # Buracos internos viram sólidos.
        ff = (al > 0.5).astype(np.uint8)
        hm = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
        for sx, sy in [(0, 0), (ff.shape[1] - 1, 0), (0, ff.shape[0] - 1), (ff.shape[1] - 1, ff.shape[0] - 1)]:
            if ff[sy, sx] == 0:
                cv2.floodFill(ff, hm, (sx, sy), 2)
        al[ff == 0] = 1.0

        # Poeira fora (partículas ficam onde fazem parte do sprite).
        n, lab, st, _ = cv2.connectedComponentsWithStats((al > 0.3).astype(np.uint8))
        if n > 1:
            biggest = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            minarea = 90 if name in PARTICLES else 900
            keep = np.array([False] + [st[i, cv2.CC_STAT_AREA] >= minarea or i == biggest for i in range(1, n)])
            al = al * keep[lab]
        al = cv2.GaussianBlur(al, (0, 0), 0.8)

        # Descontaminação da borda com o fundo conhecido.
        aa = np.clip(al, 1e-3, 1)[..., None]
        F = np.clip(np.where(aa > 0.05, (img - (1 - aa) * bg) / aa, img), 0, 255)
        edge = (al > 0.02) & (al < 0.98)
        F[~edge] = img[~edge]

        im = Image.fromarray(np.dstack([F, al * 255]).astype(np.uint8), "RGBA")
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)  # sai em 2x do pixel da sheet
        bb = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
        if bb:
            im = im.crop((max(0, bb[0] - 6), max(0, bb[1] - 6), min(im.width, bb[2] + 6), min(im.height, bb[3] + 6)))
        im.save(f"{a.work}/final/{name}.png")
        print("refine", name, im.size)


def cmd_export(a):
    os.makedirs(a.out, exist_ok=True)
    manifest = {}
    for f in sorted(glob.glob(f"{a.work}/final/*.png")):
        name = os.path.basename(f)[:-4]
        if name in SKIP_EXPORT:
            continue
        im = Image.open(f).convert("RGBA")
        im.save(os.path.join(a.out, name + ".webp"), "WEBP", quality=88, method=6, alpha_quality=92)
        manifest[name] = [im.width, im.height]
    with open(f"{a.work}/manifest.json", "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(len(manifest), "sprites em", a.out, "(atualize NEVO_SPRITES em src/components/nevo/nevo-assets.ts)")


def cmd_contact(a):
    """Folha de contato: cada sprite sobre fundo claro e sobre fundo escuro."""
    files = sorted(glob.glob(f"{a.work}/final/*.png"))
    T, cols = 200, 4
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * T * 2, rows * (T + 18)), (20, 20, 24))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        im.thumbnail((T - 8, T - 8))
        cx, cy = (i % cols) * T * 2, (i // cols) * (T + 18)
        for color, ox in (((232, 232, 232), 0), ((18, 22, 34), T)):
            tile = Image.new("RGB", (T, T), color)
            tile.paste(im, ((T - im.width) // 2, (T - im.height) // 2), im)
            sheet.paste(tile, (cx + ox, cy))
        dr.text((cx + 4, cy + T + 2), os.path.basename(f)[:-4], fill=(220, 220, 220))
    sheet.save(f"{a.work}/contact.png")
    print(f"{a.work}/contact.png")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["mask", "plate", "cut", "refine", "export", "contact", "all"])
    p.add_argument("--sheet", default="C:/TRABALHO/workflow/sprites-nevo.png")
    p.add_argument("--work", default=os.path.join(HERE, ".work"))
    p.add_argument("--out", default=os.path.join(HERE, "..", "..", "public", "brand", "nevo"))
    p.add_argument("--model", default="isnet-general-use")
    a = p.parse_args()
    os.makedirs(a.work, exist_ok=True)
    steps = ["mask", "plate", "cut", "refine", "export", "contact"] if a.cmd == "all" else [a.cmd]
    for s in steps:
        globals()[f"cmd_{s}"](a)


if __name__ == "__main__":
    main()
