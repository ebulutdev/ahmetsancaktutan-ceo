/* Ahmet Sancaktutan — etkileşim katmanı
   GSAP + ScrollTrigger + Lenis (yalnız masaüstü). Mobilde doğal kaydırma, yalnız transform/opacity animasyonları. */
(() => {
  'use strict';
  const d = document, root = d.documentElement, body = d.body;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mqDesk = matchMedia('(min-width: 901px)');
  const hasGsap = !!window.gsap && !!window.ScrollTrigger;

  /* ---------- Görseller: yumuşak belirme ---------- */
  const imgIn = (img) => {
    if (img.complete && img.naturalWidth) img.classList.add('is-in');
    else img.addEventListener('load', () => img.classList.add('is-in'), { once: true });
  };
  $$('.ph img').forEach(imgIn);

  if (!hasGsap) { body.classList.remove('is-loading'); $('.loader')?.remove(); return; }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.defaults({ ease: 'expo.out', duration: 1.2 });

  /* ---------- Yumuşak kaydırma (masaüstü) ---------- */
  let lenis = null;
  if (fine && !reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
    window.__lenis = lenis;
  }
  const scrollTo = (target) => {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else (typeof target === 'number' ? window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' })
      : target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
  };

  /* ---------- Metin bölme ---------- */
  function wordify(el) {
    const frag = d.createDocumentFragment();
    const walk = (node, wrapTag, wrapClass) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(' ')); return; }
            const w = d.createElement('span');
            w.className = 'w';
            if (wrapTag) { const e = d.createElement(wrapTag); if (wrapClass) e.className = wrapClass; e.textContent = part; w.appendChild(e); }
            else w.textContent = part;
            frag.appendChild(w);
          });
        } else if (n.nodeName === 'BR') {
          frag.appendChild(d.createElement('br'));
        } else if (n.nodeType === 1) {
          walk(n, n.nodeName.toLowerCase(), n.className);
        }
      });
    };
    walk(el);
    el.textContent = '';
    el.appendChild(frag);
    return $$('.w', el);
  }

  function splitLines(el) {
    if (!el.dataset.src) el.dataset.src = el.innerHTML;
    else el.innerHTML = el.dataset.src;
    const words = wordify(el);
    const lines = [];
    let top = null, cur = null;
    words.forEach((w) => {
      const t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 4) { cur = []; lines.push(cur); top = t; }
      cur.push(w);
    });
    el.textContent = '';
    lines.forEach((ws) => {
      const mask = d.createElement('span'); mask.className = 'line-mask';
      const inner = d.createElement('span');
      ws.forEach((w, i) => { inner.appendChild(w); if (i < ws.length - 1) inner.appendChild(d.createTextNode(' ')); });
      mask.appendChild(inner); el.appendChild(mask);
    });
    return $$('.line-mask > span', el);
  }

  /* ---------- Preloader + giriş ---------- */
  const loader = $('.loader');
  const heroImg = $('.hero img');
  function intro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from('[data-hero-media]', { scale: 1.18, duration: 2.4, ease: 'expo.out' }, 0)
      .from('[data-hero-name] .line-mask > span', { yPercent: 115, duration: 1.6, stagger: 0.12 }, 0.15)
      .from('[data-hero-fade]', { opacity: 0, y: 20, duration: 1.2, stagger: 0.08 }, 0.6)
      .from('.nav > *', { y: -30, opacity: 0, duration: 1.2, stagger: 0.08, clearProps: 'transform,opacity' }, 0.5);
    return tl;
  }
  function finishLoad() {
    // her açılışta en baştan başla (bağlantıda #bölüm varsa oraya git)
    const target = location.hash && d.querySelector(location.hash);
    if (lenis) lenis.scrollTo(target || 0, { immediate: true, force: true }); else if (!target) window.scrollTo(0, 0);
    if (target && !lenis) target.scrollIntoView();
    body.classList.remove('is-loading');
    lenis?.start();
    ScrollTrigger.refresh();
  }
  if (!loader || reduce) {
    loader?.remove(); finishLoad(); if (!reduce) intro();
  } else {
    const count = $('.loader__count'), fill = $('.loader__fill');
    const state = { p: 0 };
    let ready = false;
    const imgReady = new Promise((r) => { if (!heroImg || (heroImg.complete && heroImg.naturalWidth)) r(); else { heroImg.addEventListener('load', r, { once: true }); heroImg.addEventListener('error', r, { once: true }); } });
    Promise.race([Promise.all([imgReady, d.fonts ? d.fonts.ready : Promise.resolve()]), new Promise((r) => setTimeout(r, 2800))]).then(() => { ready = true; });
    const tick = gsap.to(state, {
      p: 88, duration: 1.4, ease: 'power2.out',
      onUpdate: () => { count.textContent = String(Math.round(state.p)).padStart(3, '0'); fill.style.clipPath = `inset(${100 - state.p}% 0 0 0)`; },
      onComplete: function wait() {
        if (!ready) { setTimeout(wait, 60); return; }
        gsap.to(state, {
          p: 100, duration: 0.45, ease: 'power1.inOut',
          onUpdate: () => { count.textContent = String(Math.round(state.p)).padStart(3, '0'); fill.style.clipPath = `inset(${100 - state.p}% 0 0 0)`; },
          onComplete: () => {
            gsap.timeline()
              .to('.loader__mark, .loader__meta', { opacity: 0, y: -24, duration: 0.6, ease: 'power3.in' })
              .to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut', onComplete: () => loader.remove() }, '-=0.15')
              .add(() => { finishLoad(); intro(); }, '-=0.75');
          },
        });
      },
    });
    void tick;
  }

  /* ---------- Nav, ilerleme çubuğu, menü ---------- */
  const nav = $('#nav');
  let lastY = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('is-scrolled', y > 40);
      if (!root.classList.contains('menu-open')) nav.classList.toggle('is-hidden', y > lastY && y > 400);
      lastY = y;
    },
  });
  gsap.to('.progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  const menuBtn = $('#menuBtn'), menu = $('#menu');
  const setMenu = (open) => {
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
    body.style.overflow = open ? 'hidden' : '';
    $('.nav__lbl', menuBtn).textContent = open ? 'Kapat' : 'Menü';
    if (open) {
      lenis?.stop();
      gsap.fromTo('.menu__list a', { yPercent: 110 }, { yPercent: 0, stagger: 0.06, duration: 1.1, delay: 0.32, ease: 'expo.out' });
      gsap.fromTo('.menu__foot > *', { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.9, delay: 0.6 });
      gsap.fromTo('.menu__mark', { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 1.6, delay: 0.3 });
    }
    else lenis?.start();
  };
  menuBtn.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));

  d.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const t = id === '#top' ? 0 : $(id);
    if (t === null) return;
    e.preventDefault();
    if (root.classList.contains('menu-open')) setMenu(false);
    scrollTo(t);
  });

  /* ---------- Bulunulan bölüm (navbar + menü) ---------- */
  const spyLinks = $$('[data-spy]');
  const setSpy = (id) => spyLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.spy === id));
  [...new Set(spyLinks.map((l) => l.dataset.spy))].forEach((id) => {
    const sec = d.getElementById(id); if (!sec) return;
    ScrollTrigger.create({ trigger: sec, start: 'top 45%', end: 'bottom 45%', refreshPriority: -1, onToggle: (st) => { if (st.isActive) setSpy(id); else if (!ScrollTrigger.getAll().some((t) => t.vars.spy && t.isActive)) setSpy(''); }, spy: true });
  });

  /* ---------- Hero scroll ---------- */
  gsap.to('[data-hero-media]', { scale: 1.12, yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('[data-hero-name]', { yPercent: -35, opacity: 0.15, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  /* ---------- Marquee: ekran dışında dur ---------- */
  const mq = $('.marquee');
  if (mq && 'IntersectionObserver' in window) new IntersectionObserver(([en]) => mq.classList.toggle('is-paused', !en.isIntersecting)).observe(mq);

  if (reduce) $$('.sec-index').forEach((el) => el.classList.add('is-in'));
  if (!reduce) {

  /* ---------- Satır satır başlık açılışı ---------- */
  const splitEls = $$('[data-split]');
  const splitAnims = new Map();
  const doSplit = () => {
    splitEls.forEach((el) => {
      splitAnims.get(el)?.scrollTrigger?.kill();
      splitAnims.get(el)?.kill();
      const lines = splitLines(el);
      const done = el.dataset.done === '1';
      if (done) return;
      const tw = gsap.from(lines, {
        yPercent: 115, duration: 1.4, stagger: 0.09,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true, onEnter: () => { el.dataset.done = '1'; } },
      });
      splitAnims.set(el, tw);
    });
  };
  (d.fonts ? d.fonts.ready : Promise.resolve()).then(() => { doSplit(); ScrollTrigger.refresh(); });
  let lastW = innerWidth;
  addEventListener('resize', () => {
    if (Math.abs(innerWidth - lastW) < 40) return;
    lastW = innerWidth;
    clearTimeout(doSplit._t);
    doSplit._t = setTimeout(() => { doSplit(); ScrollTrigger.refresh(); }, 250);
  });

  /* ---------- Manifesto: kelime kelime aydınlanma ---------- */
  $$('[data-scrub-words]').forEach((el) => {
    const words = wordify(el);
    gsap.to(words, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });
  });

  /* ---------- Bölüm başlığı çizgisi ---------- */
  ScrollTrigger.batch('.sec-index', { start: 'top 92%', once: true, onEnter: (els) => els.forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * 80)) });

  /* ---------- Genel belirmeler ---------- */
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%', once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.3, stagger: 0.09, overwrite: true }),
  });
  $$('[data-clip]').forEach((el) => {
    const img = $('img', el);
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    tl.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' });
    if (img) tl.to(img, { scale: 1, duration: 2, ease: 'expo.out', clearProps: 'transform' }, 0.1);
  });

  /* ---------- Paralaks ---------- */
  $$('[data-parallax]').forEach((el) => {
    const n = parseFloat(el.dataset.parallax) * (mqDesk.matches ? 1 : 0.5);
    gsap.fromTo(el, { yPercent: n }, { yPercent: -n, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  const aerial = $('[data-aerial]');
  if (aerial) gsap.fromTo(aerial, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.aerial', start: 'top bottom', end: 'bottom top', scrub: true } });

  /* ---------- Sayaçlar ---------- */
  const fmt = new Intl.NumberFormat('tr-TR');
  $$('[data-count]').forEach((el) => {
    const end = +el.dataset.count, plain = 'plain' in el.dataset;
    const o = { v: plain ? end - 60 : 0 };
    const show = () => { el.textContent = plain ? Math.round(o.v) : fmt.format(Math.round(o.v)); };
    show();
    gsap.to(o, { v: end, duration: plain ? 1.8 : 2.4, ease: 'power3.out', onUpdate: show, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });
  } /* !reduce */

  /* ---------- Yolculuk: yapışkan çerçeve ---------- */
  const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
  const frames = $$('[data-frame]');
  const chaps = $$('[data-chap]');
  const capN = $('[data-chap-n]'), capT = $('[data-chap-t]');
  let curChap = -1, z = 1;
  const setChap = (i) => {
    if (i === curChap) return;
    const prev = frames[curChap];
    frames.forEach((f) => { if (f !== prev) f.classList.remove('is-prev'); f.classList.remove('is-on'); });
    if (prev) prev.classList.add('is-prev');
    const f = frames[i];
    f.style.zIndex = ++z;
    void f.offsetWidth;
    f.classList.add('is-on');
    chaps.forEach((c, k) => $('.chap__year', c).classList.toggle('is-dim', k !== i));
    capN.textContent = romans[i];
    capT.textContent = $('h3', chaps[i]).textContent;
    curChap = i;
  };
  ScrollTrigger.matchMedia({
    '(min-width: 901px)': () => {
      setChap(0);
      chaps.forEach((c, i) => ScrollTrigger.create({ trigger: c, start: 'top 60%', end: 'bottom 60%', onToggle: (s) => s.isActive && setChap(i) }));
      return () => { chaps.forEach((c) => $('.chap__year', c).classList.remove('is-dim')); };
    },
  });

  /* ---------- AST yatay galeri ---------- */
  const astSec = $('#ast'), track = $('#astTrack');
  const astBar = $('.ast__counter .bar i'), astN = $('[data-ast-n]');
  const setAst = (p) => {
    gsap.set(astBar, { scaleX: p });
    astN.textContent = String(Math.min(6, Math.max(1, Math.ceil(p * 6) || 1))).padStart(2, '0');
  };
  ScrollTrigger.matchMedia({
    '(min-width: 901px)': () => {
      const dist = () => track.scrollWidth - innerWidth;
      const tw = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: astSec, start: 'top top', end: () => '+=' + dist(), pin: '.ast__pin', scrub: 0.8,
          invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (s) => setAst(s.progress),
        },
      });
      $$('.ast-card .ph img', track).forEach((img) => {
        gsap.fromTo(img, { xPercent: -6, scale: 1.14 }, {
          xPercent: 6, scale: 1.14, ease: 'none',
          scrollTrigger: { trigger: img.closest('.ast-card'), containerAnimation: tw, start: 'left right', end: 'right left', scrub: true },
        });
      });
      return () => gsap.set(track, { clearProps: 'transform' });
    },
    '(max-width: 900px)': () => {
      const cards = $('#astCards');
      const on = () => setAst(cards.scrollLeft / Math.max(1, cards.scrollWidth - cards.clientWidth));
      cards.addEventListener('scroll', on, { passive: true });
      return () => cards.removeEventListener('scroll', on);
    },
  });

  /* ---------- Lightbox ---------- */
  const DATA = window.AST_DATA || { projects: [] };
  const lb = $('#lb'), lbImg = $('[data-lb-img]'), lbTitle = $('[data-lb-title]'), lbCount = $('[data-lb-count]'), lbThumbs = $('[data-lb-thumbs]');
  let lbP = null, lbI = 0;
  const srcset = (im) => im.s.map((w) => `img/${im.n}-${w}.webp ${w}w`).join(', ');
  const lbShow = (i) => {
    const imgs = lbP.imgs; lbI = (i + imgs.length) % imgs.length;
    const im = imgs[lbI];
    lbImg.classList.add('is-swap');
    const pre = new Image();
    pre.sizes = '100vw'; pre.srcset = srcset(im); pre.src = `img/${im.n}-${im.s[im.s.length - 1]}.webp`;
    const swap = () => { lbImg.sizes = '100vw'; lbImg.srcset = pre.srcset; lbImg.src = pre.src; lbImg.alt = `${lbP.name} — ${lbI + 1}`; requestAnimationFrame(() => lbImg.classList.remove('is-swap')); };
    (pre.decode ? pre.decode() : Promise.resolve()).then(swap, swap);
    lbCount.textContent = `${String(lbI + 1).padStart(2, '0')} / ${String(imgs.length).padStart(2, '0')}`;
    $$('button', lbThumbs).forEach((b, k) => b.classList.toggle('is-on', k === lbI));
    $$('button', lbThumbs)[lbI]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  let lastFocus = null;
  const lbOpen = (k) => {
    lbP = DATA.projects[k]; if (!lbP) return;
    lastFocus = d.activeElement;
    lbTitle.textContent = lbP.name;
    lbThumbs.innerHTML = lbP.imgs.map((im, i) => `<button type="button" aria-label="Görsel ${i + 1}"><img src="img/${im.n}-${im.s[0]}.webp" alt="" loading="lazy"></button>`).join('');
    $$('button', lbThumbs).forEach((b, i) => b.addEventListener('click', () => lbShow(i)));
    lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden'; lenis?.stop();
    lbShow(0);
    $('[data-lb-close]').focus();
  };
  const lbClose = () => {
    lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true');
    body.style.overflow = ''; lenis?.start(); lastFocus?.focus();
  };
  $$('[data-ast]').forEach((b) => b.addEventListener('click', () => lbOpen(+b.dataset.ast)));
  $('[data-lb-close]').addEventListener('click', lbClose);
  $('[data-lb-prev]').addEventListener('click', () => lbShow(lbI - 1));
  $('[data-lb-next]').addEventListener('click', () => lbShow(lbI + 1));
  d.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) { if (e.key === 'Escape' && root.classList.contains('menu-open')) setMenu(false); return; }
    if (e.key === 'Escape') lbClose();
    if (e.key === 'ArrowRight') lbShow(lbI + 1);
    if (e.key === 'ArrowLeft') lbShow(lbI - 1);
  });
  let sx = null;
  lb.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  lb.addEventListener('pointerup', (e) => {
    if (sx === null) return; const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) lbShow(lbI + (dx < 0 ? 1 : -1));
  });

  /* ---------- Arka plan müziği + Video ---------- */
  const bgm = $('#bgm'), bgmBtn = $('#bgmBtn');
  let bgmUserMuted = false, bgmPausedByVideo = false, bgmRetryTimer = null;
  const syncBgmUI = () => {
    if (!bgmBtn || !bgm) return;
    const playing = !bgm.paused && !bgm.muted;
    bgmBtn.classList.toggle('is-playing', playing);
    bgmBtn.setAttribute('aria-pressed', String(playing));
    const lbl = $('.bgm-btn__lbl', bgmBtn);
    if (lbl) lbl.textContent = playing ? 'Ses Açık' : 'Ses Kapalı';
  };
  const tryPlayBgm = () => {
    if (!bgm || bgmUserMuted || bgmPausedByVideo) return;
    bgm.volume = 0.55;
    bgm.muted = false;
    const p = bgm.play();
    if (p && p.then) {
      p.then(() => {
        syncBgmUI();
        if (bgmRetryTimer) { clearInterval(bgmRetryTimer); bgmRetryTimer = null; }
      }).catch(() => {
        if (window.__bgmAC && window.__bgmAC.state === 'suspended') {
          window.__bgmAC.resume().then(() => { bgm.muted = false; bgm.play().then(syncBgmUI).catch(() => {}); }).catch(() => {});
        }
      });
    }
  };
  if (bgm) {
    bgm.addEventListener('play', syncBgmUI);
    bgm.addEventListener('pause', syncBgmUI);
    bgm.addEventListener('volumechange', syncBgmUI);
    ['canplay', 'loadeddata', 'canplaythrough'].forEach((ev) => bgm.addEventListener(ev, tryPlayBgm));
    addEventListener('load', tryPlayBgm);
    addEventListener('pageshow', tryPlayBgm);
    addEventListener('focus', tryPlayBgm);
    d.addEventListener('visibilitychange', () => { if (!d.hidden) tryPlayBgm(); });
    tryPlayBgm();
    bgmRetryTimer = setInterval(() => {
      if (bgmUserMuted || bgmPausedByVideo || (!bgm.paused && !bgm.muted)) {
        if (!bgm.paused && !bgm.muted && bgmRetryTimer) { clearInterval(bgmRetryTimer); bgmRetryTimer = null; }
        return;
      }
      tryPlayBgm();
    }, 600);
    const unlockEvents = ['pointerdown', 'touchstart', 'touchmove', 'wheel', 'keydown', 'click', 'scroll', 'pointermove', 'mousemove', 'mouseenter', 'mouseover'];
    const onFirstGesture = () => {
      if (bgmUserMuted || bgmPausedByVideo) return;
      bgm.muted = false;
      bgm.volume = 0.55;
      const p = bgm.play();
      if (p && p.then) {
        p.then(() => {
          syncBgmUI();
          if (bgmRetryTimer) { clearInterval(bgmRetryTimer); bgmRetryTimer = null; }
          unlockEvents.forEach((ev) => window.removeEventListener(ev, onFirstGesture, true));
        }).catch(() => {});
      }
    };
    unlockEvents.forEach((ev) => window.addEventListener(ev, onFirstGesture, { capture: true, passive: true }));
    if (bgmBtn) {
      bgmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bgm.paused || bgm.muted) {
          bgmUserMuted = false;
          window.__bgmUserMuted = false;
          bgm.muted = false;
          bgm.volume = 0.55;
          bgm.play().then(syncBgmUI).catch(() => {});
        } else {
          bgmUserMuted = true;
          window.__bgmUserMuted = true;
          if (bgmRetryTimer) { clearInterval(bgmRetryTimer); bgmRetryTimer = null; }
          bgm.pause();
          syncBgmUI();
        }
      });
    }
  }

  const player = $('#player');
  if (player) {
    const v = $('video', player), bar = $('.player__bar i', player), mute = $('.player__mute', player);
    v.addEventListener('play', () => {
      if (bgm && !bgm.paused) { bgmPausedByVideo = true; bgm.pause(); }
    });
    v.addEventListener('pause', () => {
      if (bgmPausedByVideo) { bgmPausedByVideo = false; tryPlayBgm(); }
    });
    const toggle = () => {
      if (v.paused) {
        v.muted = false;
        v.play().then(() => { player.classList.add('is-playing'); player.classList.remove('is-paused'); }).catch(() => { v.muted = true; v.play(); player.classList.add('is-playing'); mute.textContent = 'Sesi aç'; });
      } else { v.pause(); player.classList.add('is-paused'); }
    };
    player.addEventListener('click', (e) => { if (e.target === mute) return; toggle(); });
    player.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    mute.addEventListener('click', (e) => { e.stopPropagation(); v.muted = !v.muted; mute.textContent = v.muted ? 'Sesi aç' : 'Sesi kapat'; });
    v.addEventListener('timeupdate', () => { bar.style.transform = `scaleX(${v.currentTime / (v.duration || 1)})`; });
    v.addEventListener('ended', () => { player.classList.remove('is-playing'); player.classList.remove('is-paused'); v.currentTime = 0; if (bgmPausedByVideo) { bgmPausedByVideo = false; tryPlayBgm(); } });
    new IntersectionObserver(([en]) => { if (!en.isIntersecting && !v.paused) { v.pause(); player.classList.add('is-paused'); } }, { threshold: 0.2 }).observe(player);
  }

  /* ---------- Kürsü: liste ↔ çerçeve ---------- */
  const pod = $('.podium');
  if (pod) {
    const items = $$('[data-pod-i]', pod), slides = $$('[data-pod]', pod);
    const nEl = $('[data-pod-n]', pod), locEl = $('[data-pod-loc]', pod);
    const DUR = 5;
    let pi = 0, podTw = null, podIn = false, hover = false;
    const show = (k) => {
      const prev = slides[pi]; pi = (k + slides.length) % slides.length;
      slides.forEach((sl) => { if (sl !== prev) sl.classList.remove('is-prev'); sl.classList.remove('is-on'); });
      if (prev !== slides[pi]) prev.classList.add('is-prev');
      void slides[pi].offsetWidth; slides[pi].classList.add('is-on');
      items.forEach((b, m) => { b.classList.toggle('is-on', m === pi); gsap.set($('s', b), { scaleX: 0 }); });
      nEl.textContent = String(pi + 1).padStart(2, '0'); locEl.textContent = items[pi].dataset.loc;
      podTw?.kill();
      podTw = gsap.fromTo($('s', items[pi]), { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: 'none', paused: !podIn || hover, onComplete: () => show(pi + 1) });
    };
    items.forEach((b, k) => {
      b.addEventListener('click', () => show(k));
      if (fine) b.addEventListener('pointerenter', () => { if (k !== pi) show(k); });
    });
    pod.addEventListener('pointerenter', () => { hover = true; podTw?.pause(); });
    pod.addEventListener('pointerleave', () => { hover = false; if (podIn) podTw?.play(); });
    ScrollTrigger.create({ trigger: pod, start: 'top 80%', end: 'bottom 20%', onToggle: (st) => { podIn = st.isActive; podIn && !hover ? podTw?.play() : podTw?.pause(); } });
    show(0);
  }

  /* ---------- Alıntılar: masaüstünde kaydırma, mobilde otomatik + dokunmatik ---------- */
  const qWrap = $('#quotes'), qSec = $('.quotes--scroll');
  if (qWrap && qSec) {
    const qs = $$('.quote', qWrap), btns = $$('.quotes__nav button');
    const fills = btns.map((b) => $('i', b));
    let qi = 0, qTw = null, qIn = false;
    const go = (n) => {
      const targetIdx = (n + qs.length) % qs.length;
      if (targetIdx === qi) return;
      const prev = qs[qi], next = qs[targetIdx], dir = targetIdx > qi ? 1 : -1; qi = targetIdx;
      gsap.killTweensOf([prev, next]);
      gsap.to(prev, { opacity: 0, y: -24 * dir, duration: 0.45, ease: 'power2.in', onComplete: () => { prev.classList.remove('is-on'); gsap.set(prev, { clearProps: 'all' }); } });
      next.classList.add('is-on');
      gsap.fromTo(next, { opacity: 0, y: 30 * dir }, { opacity: 1, y: 0, duration: 0.9, delay: 0.18, ease: 'expo.out' });
      btns.forEach((b, k) => { b.classList.toggle('is-on', k === qi); b.setAttribute('aria-selected', k === qi); });
    };
    const startMobTimer = () => {
      qTw?.kill();
      fills.forEach((f, k) => gsap.set(f, { scaleX: k < qi ? 1 : 0 }));
      qTw = gsap.fromTo(fills[qi], { scaleX: 0 }, { scaleX: 1, duration: 4.5, ease: 'none', paused: !qIn, onComplete: () => { go(qi + 1); startMobTimer(); } });
    };
    ScrollTrigger.matchMedia({
      '(min-width: 901px)': () => {
        qTw?.kill();
        const st = ScrollTrigger.create({
          trigger: qSec, start: 'top top', end: 'bottom bottom',
          onUpdate: (s) => {
            const p = s.progress;
            go(Math.min(qs.length - 1, Math.floor(p * qs.length)));
            fills.forEach((f, k) => { f.style.transform = `scaleX(${Math.min(1, Math.max(0, p * qs.length - k))})`; });
          },
        });
        return () => st.kill();
      },
      '(max-width: 900px)': () => {
        const st = ScrollTrigger.create({
          trigger: qSec, start: 'top 85%', end: 'bottom 15%',
          onToggle: (s) => { qIn = s.isActive; qIn ? qTw?.play() : qTw?.pause(); },
        });
        startMobTimer();
        return () => { st.kill(); qTw?.kill(); };
      },
    });
    btns.forEach((b, k) => b.addEventListener('click', () => {
      if (mqDesk.matches) {
        const top = qSec.getBoundingClientRect().top + scrollY;
        scrollTo(top + (qSec.offsetHeight - innerHeight) * ((k + 0.5) / qs.length));
      } else {
        go(k);
        startMobTimer();
      }
    }));
  }

  /* ---------- İmleç ---------- */
  const cur = $('.cursor');
  if (fine && cur) {
    const xTo = gsap.quickTo(cur, 'x', { duration: 0.45, ease: 'power3' });
    const yTo = gsap.quickTo(cur, 'y', { duration: 0.45, ease: 'power3' });
    addEventListener('pointermove', (e) => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    d.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor], a, button');
      cur.classList.toggle('is-view', !!t && t.dataset.cursor === 'view');
      cur.classList.toggle('is-link', !!t && t.dataset.cursor !== 'view');
    });
    d.addEventListener('pointerleave', () => gsap.to(cur, { opacity: 0, duration: 0.3 }));
    d.addEventListener('pointerenter', () => gsap.to(cur, { opacity: 1, duration: 0.3 }));
  }

  /* ---------- Sektör satırları: masaüstünde manyetik his ---------- */
  if (fine) {
    $$('.sector').forEach((s) => {
      const t = $('.sector__t', s);
      s.addEventListener('pointermove', (e) => { const r = s.getBoundingClientRect(); gsap.to(t, { x: 18 + (e.clientX - r.left - r.width / 2) * 0.02, duration: 0.8 }); });
      s.addEventListener('pointerleave', () => gsap.to(t, { x: 0, duration: 1 }));
    });
  }

  /* ---------- 3D vizyon: Three.js yalnızca bölüme yaklaşınca yüklenir ---------- */
  const vz = $('#vizyon');
  if (vz && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      import(new URL('js/vision.js?v=' + (d.querySelector('script[src*="main.js"]')?.src.split('v=')[1] || '1'), d.baseURI).href)
        .then((m) => m.init({ section: vz, ScrollTrigger }))
        .catch((err) => { console.error(err); vz.classList.add('no-gl'); });
    }, { rootMargin: '150% 0px' });
    io.observe(vz);
  }

  addEventListener('load', () => ScrollTrigger.refresh());
  addEventListener('pageshow', (e) => { if (e.persisted && !location.hash) { lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : window.scrollTo(0, 0); } });
})();
