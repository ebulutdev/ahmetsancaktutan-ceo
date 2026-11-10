"""index.src.html -> index.html : responsive <picture> etiketleri, AST verisi ve proje kartları üretir.
Kullanım: python -I src/build.py   (site klasöründen)
"""
import base64, json, os, re, time, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'img')
man = json.load(open(os.path.join(IMG, 'manifest.json')))
AVIF = man['avif']
M = man['images']


def lqip(name):
    p = os.path.join(IMG, f'{name}-lqip.webp')
    return 'data:image/webp;base64,' + base64.b64encode(open(p, 'rb').read()).decode()


def hd_sizes(name):
    s = M[name]['sizes']
    hi = [w for w in s if w >= 1200]
    return hi if hi else [s[-1]]


def srcset(name, ext):
    return ', '.join(f'img/{name}-{w}.{ext} {w}w' for w in hd_sizes(name))


def pic(name, sizes, alt, eager=False):
    m = M[name]
    hs = hd_sizes(name)
    top = hs[-1]
    h = round(m['h'] * top / m['w'])
    load = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    srcs = ''
    if AVIF:
        srcs += f'<source type="image/avif" srcset="{srcset(name, "avif")}" sizes="{sizes}">'
    return (f'<picture style="background-image:url({lqip(name)});background-size:cover;background-position:center">{srcs}'
            f'<img src="img/{name}-{top}.webp" srcset="{srcset(name, "webp")}" sizes="{sizes}" '
            f'width="{top}" height="{h}" alt="{html.escape(alt)}" {load} decoding="async"></picture>')


def art(mobile, desktop, alt, eager=False):
    md, dk = M[mobile], M[desktop]
    src = ''
    for ext, typ in (([['avif', 'image/avif']] if AVIF else []) + [['webp', 'image/webp']]):
        src += f'<source media="(max-width: 900px)" type="{typ}" srcset="{srcset(mobile, ext)}" sizes="100vw">'
        src += f'<source media="(min-width: 901px)" type="{typ}" srcset="{srcset(desktop, ext)}" sizes="100vw">'
    w = dk['sizes'][-1]
    load = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<div class="ph" style="background-image:url({lqip(desktop)})"><picture>{src}'
            f'<img src="img/{desktop}-{w}.webp" alt="{html.escape(alt)}" width="{w}" height="{round(dk["h"]*w/dk["w"])}" {load} decoding="async"></picture></div>')


def preload(name, media, sizes):
    ext, typ = ('avif', 'image/avif') if AVIF else ('webp', 'image/webp')
    return (f'<link rel="preload" as="image" type="{typ}" media="{media}" '
            f'imagesrcset="{srcset(name, ext)}" imagesizes="{sizes}" fetchpriority="high">')


# ---- AST projeleri (yalnızca yüksek netlikli HD görseller) ----
AST = [
    ('mira-gold', 'Mira Gold', 'Kurumsal ofis', 'mira-gold-3', [3, 9, 4]),
    ('primo-gold', 'Primo Gold', 'Yönetim ofisi', 'primo-gold-8', [8, 4, 6, 9]),
    ('metiner-kuyumculuk', 'Metiner Kuyumculuk', 'Perakende mağaza', 'metiner-kuyumculuk-2', [2, 4, 5]),
    ('tuzla-villa', 'Tuzla Villa', 'Villa mimarisi', 'tuzla-villa-8', [8, 1, 2, 5, 6, 7]),
    ('baraka-restoran', 'Baraka Restoran', 'Restoran · mimari & iç mekân', 'baraka-restoran-7', [7, 6, 8, 9, 3]),
    ('acarkent-villa', 'Acarkent Villa İ.K.', 'Villa iç mimarisi', 'acarkent-villa-4', [4, 2]),
]
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 17L17 7M8 7h9v9"/></svg>'
cards, data = [], []
for i, (slug, name, typ, cover, idxs) in enumerate(AST):
    imgs = [f'ast-{slug}-{n}' for n in idxs if f'ast-{slug}-{n}' in M]
    data.append({'name': name, 'type': typ,
                 'imgs': [{'n': k, 's': hd_sizes(k), 'w': M[k]['w'], 'h': M[k]['h']} for k in imgs]})
    cards.append(
        f'<button class="ast-card" type="button" data-ast="{i}" data-cursor="view" aria-label="{html.escape(name)} galerisini aç">'
        f'<div class="ph">{pic("ast-" + cover, "(max-width: 900px) 100vw, 75vw", name + " — AST Mimarlık")}</div>'
        f'<span class="ast-card__open">{ARROW}</span>'
        f'<div class="ast-card__meta"><div><h3>{html.escape(name)}</h3><div class="ast-card__type">{html.escape(typ)}</div></div>'
        f'<span class="ast-card__n">{len(imgs):02d} görsel</span></div></button>')

# ---- FETSAN projeleri ----
F = 'https://fetsangrup.com'
PR = [('pr-madimak', 'Madımak Sitesi', 'Site projesi', 'Küçükçekmece', F + '/projelerimiz/madimak-sitesi/'),
      ('pr-sogut', 'Söğüt Bulut Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/sogut-bulut-apartman/'),
      ('pr-turkmen', 'Türkmen Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/turkmen-apartman/'),
      ('pr-ozgur', 'Özgür Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/ozgur-apartman/'),
      ('pr-deniz', 'Deniz Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/deniz-apartman/'),
      ('pr-kose', 'Köşe Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/kose-apartman/'),
      ('pr-yildirim', 'Yıldırım Apartmanı', 'Konut projesi', 'Bahçelievler', F + '/projelerimiz/yildirim-apartmani/'),
      ('urban', 'Kentsel Dönüşüm', 'Hizmet alanı', 'İstanbul geneli', F + '/kentsel-donusum'),
      ('arch', 'Mimarlık', 'Hizmet alanı', 'AST Mimarlık', 'https://www.astmimarlik.com/projeler')]
projects = ''.join(
    f'<a class="pcard" href="{url}" target="_blank" rel="noopener" data-cursor="view" data-reveal>'
    f'<div class="ph" data-clip>{pic(k, "(max-width: 900px) 100vw, 55vw", n)}</div>'
    f'<div class="pcard__body"><h3>{html.escape(n)}</h3><div class="pcard__spec"><span>{t}</span><span>{loc}</span></div></div></a>'
    for k, n, t, loc, url in PR)

src = open(os.path.join(ROOT, 'src', 'index.src.html'), encoding='utf-8').read()


def rep(m):
    kind, args = m.group(1), m.group(2)
    if kind == 'ver':
        return str(int(time.time()))
    if kind == 'ast-cards':
        return '\n'.join(cards)
    if kind == 'ast-data':
        return json.dumps({'avif': AVIF, 'projects': data}, ensure_ascii=False)
    if kind == 'projects':
        return projects
    a = args.split('|')
    if kind == 'pic':
        return pic(a[0], a[1], a[2], len(a) > 3 and a[3] == 'eager')
    if kind == 'art':
        return art(a[0], a[1], a[2], len(a) > 3 and a[3] == 'eager')
    if kind == 'preload':
        return preload(a[0], a[1], a[2])
    raise ValueError(kind)


out = re.sub(r'\[\[([a-z-]+):?([^\]]*)\]\]', rep, src)
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8', newline='\n').write(out)
print('index.html', len(out) // 1024, 'KB')
