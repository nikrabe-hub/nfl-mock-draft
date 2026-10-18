"""Erzeugt die App-Icons (generisches Football-Symbol, kein NFL-Logo).
Aufruf: python3 scripts/make-icons.py   (benötigt Pillow)"""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
NAVY, GOLD, BROWN, WHITE = (11, 42, 91), (245, 184, 0), (139, 69, 19), (255, 255, 255)

def football(size, scale):
    """Football-Symbol auf Navy; scale = Anteil der Fläche, den das Symbol nutzt."""
    S = 1024
    img = Image.new('RGB', (S, S), NAVY)
    d = ImageDraw.Draw(img)
    d.ellipse((S*0.08, S*0.08, S*0.92, S*0.92), outline=GOLD, width=int(S*0.025))  # goldener Ring
    ball = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    b = ImageDraw.Draw(ball)
    w, h = S*0.62*scale, S*0.34*scale
    cx, cy = S/2, S/2
    b.ellipse((cx-w/2, cy-h/2, cx+w/2, cy+h/2), fill=BROWN, outline=WHITE, width=int(S*0.012))
    b.line((cx-w*0.30, cy, cx+w*0.30, cy), fill=WHITE, width=int(S*0.02))  # Mittelnaht
    for i in range(-3, 4):                                                   # Schnürung
        x = cx + i*w*0.075
        b.line((x, cy-h*0.12, x, cy+h*0.12), fill=WHITE, width=int(S*0.014))
    for sx in (-0.34, 0.34):                                                 # Streifen an den Spitzen
        x = cx + sx*w
        b.arc((x-w*0.05, cy-h*0.46, x+w*0.05, cy+h*0.46), 90, 270, fill=WHITE, width=int(S*0.012))
    ball = ball.rotate(32, resample=Image.BICUBIC, center=(cx, cy))
    img.paste(ball, (0, 0), ball)
    return img.resize((size, size), Image.LANCZOS)

football(192, 1.0).save(os.path.join(OUT, 'icon-192.png'))
football(512, 1.0).save(os.path.join(OUT, 'icon-512.png'))
football(512, 0.8).save(os.path.join(OUT, 'icon-maskable-512.png'))   # mehr Rand für runde Masken
football(180, 0.9).save(os.path.join(OUT, 'apple-touch-icon.png'))
print('Icons erzeugt in', os.path.abspath(OUT))
