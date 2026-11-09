/* "Çizgiden Gerçeğe" — prosedürel mimari sahne (Three.js r160)
   Faz 1: CAD tel kafes · Faz 2: strüktür + vinç · Faz 3: altın saat render'ı · Faz 4: gece render'ı
   Harici model yok. Optimizasyon: instancing, isteğe bağlı gölge güncellemesi, uyarlanır çözünürlük,
   bloom yalnız masaüstünde ve yalnız gece fazında. */
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

const GOLD = 0xc5a059, BLUE = 0xbfd3e6, AMBER = 0xffb86c;
const N = 6, H = 3.5, SLAB = 0.35;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

const FLOORS = [
  { x: 0,    z: 0,    w: 22, d: 14, clad: [],           fins: false, lobby: true },
  { x: 2.5,  z: 0.5,  w: 25, d: 15, clad: ['-x'],       fins: true },
  { x: 2.5,  z: 1.5,  w: 25, d: 17, clad: ['-x', '-z'], fins: false, balcony: true },
  { x: -2,   z: 1.5,  w: 26, d: 17, clad: ['+x'],       fins: true, balcony: true },
  { x: -2,   z: 0,    w: 22, d: 14, clad: ['-z'],       fins: false },
  { x: 1,    z: -0.5, w: 18, d: 12, clad: ['-x'],       fins: true },
];
const COLS = [];
for (const x of [-9, -3, 3, 9]) for (const z of [-5.5, 0, 5.5]) COLS.push([x, z]);
const CORE = { x: -5.5, z: -2.5, w: 4.2, d: 5 };

/* ---------------- yardımcılar ---------------- */
class Lines {
  constructor() { this.a = []; }
  seg(x1, y1, z1, x2, y2, z2) { this.a.push(x1, y1, z1, x2, y2, z2); return this; }
  box(cx, cy, cz, w, h, d) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 5], [2, 6], [3, 7], [4, 5], [5, 6], [6, 7], [7, 4]].forEach(([i, j]) => this.seg(...P[i], ...P[j]));
    return this;
  }
  rectXY(cx, cy, z, w, h) { const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2; return this.seg(x0, y0, z, x1, y0, z).seg(x1, y0, z, x1, y1, z).seg(x1, y1, z, x0, y1, z).seg(x0, y1, z, x0, y0, z); }
  rectZY(x, cy, cz, d, h) { const z0 = cz - d / 2, z1 = cz + d / 2, y0 = cy - h / 2, y1 = cy + h / 2; return this.seg(x, y0, z0, x, y0, z1).seg(x, y0, z1, x, y1, z1).seg(x, y1, z1, x, y1, z0).seg(x, y1, z0, x, y0, z0); }
  build(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.a, 3));
    const l = new THREE.LineSegments(g, mat);
    l.userData.count = this.a.length / 3; l.frustumCulled = false;
    return l;
  }
}

function label(text, { h = 0.8, color = '#C5A059' } = {}) {
  const fs = 72, pad = 18, c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `500 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.font = font; c.width = Math.ceil(ctx.measureText(text).width) + pad * 2; c.height = fs + pad * 2;
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(h * c.width / c.height, h, 1);
  return s;
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}
const marbleTex = (base0, base1, vein, n = 26) => canvasTex(512, (x, S) => {
  const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, base0); g.addColorStop(1, base1);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    x.strokeStyle = `rgba(${vein},${0.05 + rand() * 0.16})`; x.lineWidth = 0.6 + rand() * 1.8;
    x.beginPath(); let px = rand() * S, py = 0; x.moveTo(px, py);
    while (py < S) { px += (rand() - 0.5) * 38; py += 14 + rand() * 20; x.lineTo(px, py); }
    x.stroke();
  }
});
const travertineTex = () => canvasTex(512, (x, S) => {
  x.fillStyle = '#d9ccb4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${150 + rand() * 60},${130 + rand() * 50},${100 + rand() * 40},${0.06 + rand() * 0.1})`; x.fillRect(rand() * S, rand() * S, 2 + rand() * 30, 1 + rand() * 2); }
  x.strokeStyle = 'rgba(120,105,85,.35)'; x.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(0, k * S / 4); x.lineTo(S, k * S / 4); x.stroke(); x.beginPath(); x.moveTo(k * S / 2, 0); x.lineTo(k * S / 2, S); x.stroke(); }
}, 4);
const woodTex = () => canvasTex(256, (x, S) => {
  x.fillStyle = '#8a5a36'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${60 + rand() * 50},${35 + rand() * 25},${18 + rand() * 15},${0.15 + rand() * 0.3})`; x.lineWidth = 0.5 + rand() * 2; const y = rand() * S; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(S * 0.3, y + rand() * 6 - 3, S * 0.6, y + rand() * 6 - 3, S, y); x.stroke(); }
});
const pavingTex = () => canvasTex(512, (x, S) => {
  x.fillStyle = '#4a4640'; x.fillRect(0, 0, S, S);
  const n = 8, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 62 + rand() * 18; x.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`; x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4); }
}, 10);

/* gökyüzü kubbesi */
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.5, 0.2, 0.6).normalize() }, uSunCol: { value: new THREE.Color(0xffc98a) }, uSun: { value: 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop,uHor,uBot,uSunDir,uSunCol; uniform float uSun; varying vec3 vDir;
      void main(){ float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-h,0.0,1.0), 0.35));
        float s = max(dot(normalize(vDir), uSunDir), 0.0);
        c += uSunCol * (pow(s, 380.0) * 2.5 + pow(s, 12.0) * 0.35) * uSun;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
}

/* organik yaprak kümesi geometrisi (vertex renkli, gürültülü) */
function foliageGeometry(lumps, palette, detail = 2) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  lumps.forEach(([x, y, z, sx, sy, sz]) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(vx * 5.1 + vy * 3.7) * Math.cos(vz * 4.3 + vx * 2.1);
      p.setXYZ(i, vx * sx * n + x, vy * sy * n + y, vz * sz * n + z);
    }
    const pp = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pp.count; i += 3) {
      c.set(palette[Math.floor(rand() * palette.length)]);
      const shade = 0.8 + rand() * 0.3 + (pp.getY(i) - y) * 0.07;
      for (let k = 0; k < 3; k++) {
        const px = pp.getX(i + k), py = pp.getY(i + k), pz = pp.getZ(i + k);
        // elipsoid normali: yumuşak, yuvarlak taç gölgelemesi + hafif yaprak pürüzü
        v.set((px - x) / (sx * sx), (py - y) / (sy * sy), (pz - z) / (sz * sz)).normalize();
        v.x += (rand() - 0.5) * 0.25; v.y += (rand() - 0.5) * 0.25; v.z += (rand() - 0.5) * 0.25; v.normalize();
        pos.push(px, py, pz); nor.push(v.x, v.y, v.z); col.push(c.r * shade, c.g * shade, c.b * shade);
      }
    }
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/* ====================================================================== */
export async function init({ section, ScrollTrigger }) {
  const canvas = section.querySelector('canvas');
  const stage = section.querySelector('.vz__sticky');
  const mobile = matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false }); }
  catch (e) { section.classList.add('no-gl'); return; }
  section.classList.add('has-gl');
  const maxDpr = Math.min(devicePixelRatio, mobile ? 1.5 : 1.75);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  try { await document.fonts.load('500 72px "JetBrains Mono"'); } catch (e) { /* yedek font */ }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 52 : 36, 1, 0.5, 900);

  /* ---------- gökyüzü + ortam haritaları ---------- */
  const sky = makeSky();
  scene.add(sky);
  const SKY = {
    cad:   { top: new THREE.Color(0x0a0a0c), hor: new THREE.Color(0x0a0a0c), bot: new THREE.Color(0x0a0a0c) },
    gold:  { top: new THREE.Color(0x27466f), hor: new THREE.Color(0xf1b981), bot: new THREE.Color(0x2a241f) },
    night: { top: new THREE.Color(0x03050c), hor: new THREE.Color(0x221c2c), bot: new THREE.Color(0x07070a) },
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envFrom = (k, sunAmt) => {
    const s = new THREE.Scene(); const d = makeSky();
    d.material.uniforms.uTop.value.copy(SKY[k].top); d.material.uniforms.uHor.value.copy(SKY[k].hor); d.material.uniforms.uBot.value.copy(SKY[k].bot);
    d.material.uniforms.uSun.value = sunAmt; s.add(d);
    const t = pmrem.fromScene(s, 0.02).texture; d.geometry.dispose(); d.material.dispose(); return t;
  };
  const ENV = { day: envFrom('gold', 1), night: envFrom('night', 0) };
  scene.environment = ENV.day;
  scene.fog = new THREE.Fog(0x0a0a0c, 90, 300);

  /* ---------- materyaller (sıcak lüks palet) ---------- */
  const trav = travertineTex();
  // iç mekân ışık haritası: tavana yakın parlak, zemine doğru sönen; aralıklı spot havuzları
  const roomGlow = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgb(255,236,205)'); g.addColorStop(0.25, 'rgb(205,160,110)'); g.addColorStop(0.75, 'rgb(92,64,40)'); g.addColorStop(1, 'rgb(48,32,22)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 5; k++) {
      const cx = 26 + k * 51, rg = x.createRadialGradient(cx, 30, 2, cx, 70, 70);
      rg.addColorStop(0, 'rgba(255,225,180,.55)'); rg.addColorStop(1, 'rgba(255,225,180,0)');
      x.fillStyle = rg; x.fillRect(cx - 70, 0, 140, 160);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const M = {
    slab: new THREE.MeshStandardMaterial({ color: 0xffffff, map: trav, roughness: 0.58 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb5ada1, roughness: 0.85 }),
    core: new THREE.MeshStandardMaterial({ map: marbleTex('#e8e2d6', '#d6cfc2', '150,135,110', 20), roughness: 0.28 }),
    clad: new THREE.MeshStandardMaterial({ map: marbleTex('#2c2d31', '#1f2024', '197,160,89', 22), roughness: 0.34, metalness: 0.15 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.52 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0xa8854f, roughness: 0.3, metalness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x5f7e96, roughness: 0.02, metalness: 0.05, ior: 1.5, reflectivity: 0.9, transparent: true, opacity: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.4, depthWrite: false }),
    rail: new THREE.MeshPhysicalMaterial({ color: 0xcfe0ee, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0, envMapIntensity: 1.6, depthWrite: false }),
    roomLit: new THREE.MeshStandardMaterial({ color: 0x1e1914, emissive: 0xffffff, emissiveMap: roomGlow, emissiveIntensity: 0, roughness: 0.9, side: THREE.BackSide }),
    roomDim: new THREE.MeshStandardMaterial({ color: 0x151412, emissive: 0xffffff, emissiveMap: roomGlow, emissiveIntensity: 0, roughness: 0.9, side: THREE.BackSide }),
    band: new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffe2bd, emissiveIntensity: 0 }),
    partition: new THREE.MeshStandardMaterial({ color: 0xe3dccf, roughness: 0.8 }),
    water: new THREE.MeshStandardMaterial({ color: 0x0f6d7d, emissive: 0x2fc6d9, emissiveIntensity: 0, roughness: 0.05, metalness: 0.2, envMapIntensity: 2 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95 }),
    plinth: new THREE.MeshStandardMaterial({ map: pavingTex(), roughness: 0.82 }),
    lawn: new THREE.MeshStandardMaterial({ color: 0x4a6a32, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
    road: new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: 0.9 }),
    lampHead: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc98a, emissiveIntensity: 0 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.5, metalness: 0.7 }),
    mark: new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.8 }),
  };
  const LM = {
    gold: new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 1, depthWrite: false }),
    blue: new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.55, depthWrite: false }),
    dim: new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, depthWrite: false }),
    crane: new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false }),
  };

  const box = (w, h, d, mat, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = cast; m.receiveShadow = true; return m; };
  const inst = (geo, mat, list, cast = true) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); const o = new THREE.Object3D();
    list.forEach(([x, y, z, ry = 0, s = 1], i) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.count = list.length; im.castShadow = cast; im.receiveShadow = true; return im;
  };

  /* ---------- zemin, CAD ızgarası, pusula ---------- */
  const world = new THREE.Group(); scene.add(world);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);

  const gridMajor = new THREE.GridHelper(160, 32, GOLD, GOLD);
  Object.assign(gridMajor.material, { transparent: true, opacity: 0.32, depthWrite: false }); gridMajor.position.y = 0.02;
  const gridMinor = new THREE.GridHelper(160, 160, 0x3a3f4a, 0x3a3f4a);
  Object.assign(gridMinor.material, { transparent: true, opacity: 0.22, depthWrite: false }); gridMinor.position.y = 0.015;
  world.add(gridMinor, gridMajor);

  const site = new THREE.Group();
  const plinth = box(40, 0.3, 30, M.plinth, false); plinth.position.set(0.5, 0.15, 1.5);
  const lawnA = box(9, 0.08, 22, M.lawn, false); lawnA.position.set(-14.5, 0.34, 1);
  const lawnB = box(34, 0.08, 4.5, M.lawn, false); lawnB.position.set(0.5, 0.34, 13.6);
  const road = box(300, 0.05, 10, M.road, false); road.position.set(0, 0.03, 23);
  const marks = inst(new THREE.BoxGeometry(3, 0.02, 0.18), M.mark, Array.from({ length: 30 }, (_, i) => [-87 + i * 6, 0.07, 23]), false);
  site.add(plinth, lawnA, lawnB, road, marks);

  // ağaçlar: çınar (yuvarlak taç) + servi (dar taç) — instancing ile birkaç çizim çağrısı
  const PAL_PLANE = ['#3d5a2a', '#4b6b31', '#58783a', '#46632d', '#6a8540'];
  const PAL_CYP = ['#243b22', '#2d4728', '#33502c', '#1f3420'];
  const planeCrown = foliageGeometry([[0, 0, 0, 1.6, 1.3, 1.6], [1.1, 0.4, 0.3, 1.1, 0.95, 1.1], [-1, 0.3, -0.4, 1.15, 1, 1.15], [0.2, 1.05, -0.2, 1.1, 0.95, 1.1], [-0.3, 0.2, 1, 1, 0.9, 1], [0.4, -0.4, -1, 0.95, 0.8, 0.95], [0, 1.6, 0.3, 0.8, 0.7, 0.8]], PAL_PLANE);
  const cypCrown = foliageGeometry([[0, 0, 0, 0.85, 1.4, 0.85], [0, 1.6, 0, 0.75, 1.3, 0.75], [0, 3.1, 0, 0.6, 1.1, 0.6], [0, 4.3, 0, 0.42, 0.9, 0.42], [0, 5.2, 0, 0.22, 0.6, 0.22]], PAL_CYP);
  const hedgeGeo = foliageGeometry([[0, 0, 0, 0.9, 0.6, 0.9]], PAL_PLANE, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 3.2, 7); trunkGeo.translate(0, 1.6, 0);
  const cypTrunk = new THREE.CylinderGeometry(0.1, 0.16, 1.6, 6); cypTrunk.translate(0, 0.8, 0);

  const planes = [[-24, 19], [-14, 19], [-4, 19], [6, 19], [16, 19], [26, 19], [-21, -10], [24, -6]];
  const cyps = [[-17.5, -8], [-17.5, -4], [-17.5, 0], [-17.5, 4], [-17.5, 8], [19.5, 6], [19.5, 10]];
  const hedges = []; for (let x = -12; x <= 14; x += 1.7) hedges.push([x, 0.6, 15.6, rand() * 3, 0.8 + rand() * 0.25]);
  const trees = { plane: [], cyp: [] };
  const planeTrunks = inst(trunkGeo, M.bark, planes.map(([x, z]) => [x, 0, z]));
  const cypTrunks = inst(cypTrunk, M.bark, cyps.map(([x, z]) => [x, 0.3, z]));
  const planeLeaves = inst(planeCrown, M.leaf, planes.map(([x, z]) => { const s = 1.05 + rand() * 0.35, ry = rand() * 6; trees.plane.push({ x, z, s, ry, ph: rand() * 6 }); return [x, 4.6, z, ry, s]; }));
  const cypLeaves = inst(cypCrown, M.leaf, cyps.map(([x, z]) => { const s = 0.95 + rand() * 0.2, ry = rand() * 6; trees.cyp.push({ x, z, s, ry, ph: rand() * 6 }); return [x, 2.1, z, ry, s]; }));
  planeLeaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cypLeaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const hedgeMesh = inst(hedgeGeo, M.leaf, hedges);
  site.add(planeTrunks, cypTrunks, planeLeaves, cypLeaves, hedgeMesh);

  // sokak lambaları
  const lampPos = [-30, -18, -6, 6, 18, 30].map((x) => [x, 0, 17.6]);
  site.add(inst(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6).translate(0, 2.1, 0), M.pole, lampPos));
  site.add(inst(new THREE.SphereGeometry(0.18, 12, 8), M.lampHead, lampPos.map(([x, , z]) => [x, 4.25, z]), false));
  world.add(site);

  // pusula / koordinat halkası
  const compass = new THREE.Group();
  {
    const cl = new Lines(), R = 30, R2 = 31.2;
    for (let i = 0; i < 128; i++) {
      const a0 = (i / 128) * Math.PI * 2, a1 = ((i + 1) / 128) * Math.PI * 2;
      cl.seg(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R);
      cl.seg(Math.cos(a0) * R2, 0, Math.sin(a0) * R2, Math.cos(a1) * R2, 0, Math.sin(a1) * R2);
    }
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = i % 9 === 0 ? R - 1.6 : R - 0.6; cl.seg(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * R, 0, Math.sin(a) * R); }
    compass.add(cl.build(LM.dim));
    [['K', 0, -1], ['D', 1, 0], ['G', 0, 1], ['B', -1, 0]].forEach(([t, x, z]) => { const s = label(t, { h: 1.6 }); s.position.set(x * (R2 + 2), 0.4, z * (R2 + 2)); compass.add(s); });
  }
  compass.position.y = 0.04; world.add(compass);
  const compassSprites = compass.children.filter((c) => c.isSprite);

  /* ---------- bina ---------- */
  const building = new THREE.Group(); building.position.y = 0.3; world.add(building);
  const colGeo = new THREE.BoxGeometry(0.45, H - SLAB, 0.45);
  const floors = [], nightLights = [];
  const inside = (x, z, f, m = 0.9) => x > f.x - f.w / 2 + m && x < f.x + f.w / 2 - m && z > f.z - f.d / 2 + m && z < f.z + f.d / 2 - m;

  FLOORS.forEach((f, i) => {
    const g = new THREE.Group(); g.position.y = i * H;
    const struct = new THREE.Group(), facade = new THREE.Group(), interior = new THREE.Group();
    g.add(struct, facade, interior);
    const wGold = new Lines(), wBlue = new Lines();
    const ph = H - SLAB - 0.08, py = SLAB + ph / 2;

    const slab = box(f.w, SLAB, f.d, M.slab); slab.position.set(f.x, SLAB / 2, f.z); struct.add(slab);
    wGold.box(f.x, SLAB / 2, f.z, f.w, SLAB, f.d);
    const cols = COLS.filter(([x, z]) => inside(x, z, f, 1.2) && inside(x, z, FLOORS[0], 0.5));
    struct.add(inst(colGeo, M.concrete, cols.map(([x, z]) => [x, SLAB + (H - SLAB) / 2, z])));
    cols.forEach(([x, z]) => wGold.box(x, SLAB + (H - SLAB) / 2, z, 0.45, H - SLAB, 0.45));
    const core = box(CORE.w, H, CORE.d, M.core); core.position.set(CORE.x, H / 2, CORE.z); struct.add(core);
    wGold.box(CORE.x, H / 2, CORE.z, CORE.w, H, CORE.d);
    for (let s = 0; s < 10; s++) wBlue.seg(CORE.x - CORE.w / 2 + 0.3, 0.35 * s + 0.2, CORE.z - 1 + s * 0.28, CORE.x + CORE.w / 2 - 0.3, 0.35 * s + 0.2, CORE.z - 1 + s * 0.28);

    const inset = f.balcony ? 1.6 : 0.6;
    const ex0 = f.x - f.w / 2 + 0.6, ex1 = f.x + f.w / 2 - 0.6, ez0 = f.z - f.d / 2 + 0.6, ez1 = f.z + f.d / 2 - inset;
    const ew = ex1 - ex0, ed = ez1 - ez0, ecx = (ex0 + ex1) / 2, ecz = (ez0 + ez1) / 2;
    const glassList = [], pane = 2.2;
    const sideX = (z) => { const n = Math.max(1, Math.round(ew / pane)), pw = ew / n; for (let k = 0; k < n; k++) { const x = ex0 + pw * (k + 0.5); glassList.push([x, py, z, 0, pw]); wBlue.rectXY(x, py, z, pw - 0.06, ph); } };
    const sideZ = (x) => { const n = Math.max(1, Math.round(ed / pane)), pw = ed / n; for (let k = 0; k < n; k++) { const z = ez0 + pw * (k + 0.5); glassList.push([x, py, z, Math.PI / 2, pw]); wBlue.rectZY(x, py, z, pw - 0.06, ph); } };
    const cladAdd = (w, d, x, z) => { const c = box(w, ph, d, M.clad); c.position.set(x, py, z); facade.add(c); wGold.box(x, py, z, w, ph, d); };
    if (f.clad.includes('+z')) cladAdd(ew, 0.3, ecx, ez1); else sideX(ez1);
    if (f.clad.includes('-z')) cladAdd(ew, 0.3, ecx, ez0); else sideX(ez0);
    if (f.clad.includes('+x')) cladAdd(0.3, ed, ex1, ecz); else sideZ(ex1);
    if (f.clad.includes('-x')) cladAdd(0.3, ed, ex0, ecz); else sideZ(ex0);

    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, ph, 0.05), M.glass, glassList.length);
    const o = new THREE.Object3D();
    glassList.forEach(([x, y, z, ry, pw], k) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(pw - 0.06, 1, 1); o.updateMatrix(); glass.setMatrixAt(k, o.matrix); });
    glass.renderOrder = 2; facade.add(glass);
    facade.add(inst(new THREE.BoxGeometry(0.07, ph, 0.07), M.bronze, glassList.map(([x, , z, ry, pw]) => (ry ? [x + 0.03, py, z - pw / 2] : [x - pw / 2, py, z + 0.03]))));
    const fascia = box(f.w + 0.03, 0.06, f.d + 0.03, M.bronze, false); fascia.position.set(f.x, SLAB - 0.07, f.z); facade.add(fascia);

    if (f.fins) {
      const fins = [];
      for (let x = ex0 + 0.4; x < ex1 - 0.2; x += 0.75) { fins.push([x, py, ez1 + 0.38]); wBlue.seg(x, SLAB, ez1 + 0.38, x, SLAB + ph, ez1 + 0.38); }
      facade.add(inst(new THREE.BoxGeometry(0.1, ph, 0.42), M.wood, fins));
    }
    if (f.balcony || i === 1 || i === 3) {
      const rz = f.z + f.d / 2 - 0.08;
      const rail = box(f.w - 0.2, 1.05, 0.04, M.rail, false); rail.position.set(f.x, SLAB + 0.55, rz); rail.renderOrder = 3;
      const top = box(f.w - 0.2, 0.06, 0.08, M.bronze); top.position.set(f.x, SLAB + 1.1, rz);
      facade.add(rail, top); wBlue.rectXY(f.x, SLAB + 0.55, rz, f.w - 0.2, 1.05);
      const pots = []; for (let x = f.x - f.w / 2 + 1.5; x < f.x + f.w / 2 - 1; x += 3.2) pots.push([x, SLAB + 0.45, rz - 0.7, rand() * 3, 0.55]);
      facade.add(inst(hedgeGeo, M.leaf, pots));
    }
    if (f.lobby) { const can = box(9, 0.25, 4, M.clad); can.position.set(4, H - 0.6, f.z + f.d / 2 + 1.6); facade.add(can); wGold.box(4, H - 0.6, f.z + f.d / 2 + 1.6, 9, 0.25, 4); }

    const room = new THREE.Mesh(new THREE.BoxGeometry(ew - 0.5, ph - 0.12, ed - 0.5), i !== 4 ? M.roomLit : M.roomDim);
    room.position.set(ecx, py, ecz); interior.add(room);
    const bands = []; for (let k = -1; k <= 1; k++) bands.push([ecx, H - 0.24, ecz + k * ed * 0.28]);
    interior.add(inst(new THREE.BoxGeometry(ew * 0.78, 0.05, 0.22), M.band, bands, false));
    const parts = [[ecx - ew * 0.12, py, ecz - ed * 0.18], [ecx + ew * 0.22, py, ecz + ed * 0.1]];
    interior.add(inst(new THREE.BoxGeometry(0.12, ph - 0.3, ed * 0.42), M.partition, parts, false));
    parts.forEach(([x, y, z]) => wBlue.rectZY(x, y, z, ed * 0.42, ph));
    if (i % 2 === 1) { const pl = new THREE.PointLight(0xffc68f, 0, 16, 2); pl.position.set(ecx, 1.5, ecz + ed * 0.1); g.add(pl); nightLights.push(pl); }

    const goldL = wGold.build(LM.gold), blueL = wBlue.build(LM.blue);
    goldL.geometry.setDrawRange(0, 0); blueL.geometry.setDrawRange(0, 0); g.add(goldL, blueL);
    struct.scale.y = facade.scale.y = 0.0001; struct.visible = facade.visible = interior.visible = false;
    building.add(g); floors.push({ g, struct, facade, interior, goldL, blueL });
  });

  { // çatı terası
    const f = FLOORS[N - 1], g = new THREE.Group(); g.position.y = N * H;
    const struct = new THREE.Group(), facade = new THREE.Group(), interior = new THREE.Group(); g.add(struct, facade, interior);
    const wGold = new Lines(), wBlue = new Lines();
    const rw = f.w + 4, rd = f.d + 2, rx = f.x - 1, rz = f.z + 0.5;
    const roof = box(rw, SLAB, rd, M.slab); roof.position.set(rx, SLAB / 2, rz); struct.add(roof); wGold.box(rx, SLAB / 2, rz, rw, SLAB, rd);
    const stair = box(CORE.w, 3, CORE.d, M.clad); stair.position.set(CORE.x, SLAB + 1.5, CORE.z); struct.add(stair); wGold.box(CORE.x, SLAB + 1.5, CORE.z, CORE.w, 3, CORE.d);
    const beams = []; for (let x = rx + 1; x < rx + rw / 2 - 1; x += 0.9) { beams.push([x, SLAB + 2.9, rz + 1]); wBlue.seg(x, SLAB + 2.9, rz - 3, x, SLAB + 2.9, rz + 5); }
    facade.add(inst(new THREE.BoxGeometry(0.12, 0.22, 8), M.wood, beams));
    const posts = [[rx + 1, SLAB + 1.4, rz - 3], [rx + rw / 2 - 1, SLAB + 1.4, rz - 3], [rx + 1, SLAB + 1.4, rz + 5], [rx + rw / 2 - 1, SLAB + 1.4, rz + 5]];
    facade.add(inst(new THREE.BoxGeometry(0.18, 2.8, 0.18), M.bronze, posts)); posts.forEach(([x, y, z]) => wGold.box(x, y, z, 0.18, 2.8, 0.18));
    const pool = box(9, 0.4, 3.6, M.water, false); pool.position.set(rx - rw / 2 + 6.5, SLAB + 0.2, rz + rd / 2 - 3); facade.add(pool);
    wBlue.rectXY(pool.position.x, SLAB + 0.2, pool.position.z + 1.8, 9, 0.4);
    const rail = box(rw - 0.2, 1.1, 0.04, M.rail, false); rail.position.set(rx, SLAB + 0.6, rz + rd / 2 - 0.08); rail.renderOrder = 3; facade.add(rail);
    wBlue.rectXY(rx, SLAB + 0.6, rz + rd / 2 - 0.08, rw - 0.2, 1.1);
    facade.add(inst(hedgeGeo, M.leaf, [[rx + rw / 2 - 2, SLAB + 0.5, rz - 4, 0, 0.9], [rx + rw / 2 - 4, SLAB + 0.5, rz - 4.4, 1, 0.8], [rx + rw / 2 - 2.5, SLAB + 0.5, rz + 4, 2, 0.85]]));
    const goldL = wGold.build(LM.gold), blueL = wBlue.build(LM.blue);
    goldL.geometry.setDrawRange(0, 0); blueL.geometry.setDrawRange(0, 0); g.add(goldL, blueL);
    struct.scale.y = facade.scale.y = 0.0001; struct.visible = facade.visible = false;
    building.add(g); floors.push({ g, struct, facade, interior, goldL, blueL });
  }
  const TOTAL = floors.length;

  /* ---------- ölçülendirme, kotlar ---------- */
  const dims = new THREE.Group();
  {
    const L = new Lines(), minX = -11.5, maxX = 14.5, minZ = -7.5, maxZ = 10, dz = maxZ + 4.5, dx = maxX + 5;
    const tick = (x, y, z) => L.seg(x - 0.5, y, z + 0.5, x + 0.5, y, z - 0.5);
    L.seg(minX, 0.05, dz, maxX, 0.05, dz); tick(minX, 0.05, dz); tick(maxX, 0.05, dz);
    L.seg(minX, 0.05, maxZ + 0.6, minX, 0.05, dz + 0.8); L.seg(maxX, 0.05, maxZ + 0.6, maxX, 0.05, dz + 0.8);
    L.seg(dx, 0.05, minZ, dx, 0.05, maxZ); tick(dx, 0.05, minZ); tick(dx, 0.05, maxZ);
    L.seg(maxX + 0.6, 0.05, minZ, dx + 0.8, 0.05, minZ); L.seg(maxX + 0.6, 0.05, maxZ, dx + 0.8, 0.05, maxZ);
    L.seg(dx, 0.3, maxZ, dx, 0.3 + N * H + 3, maxZ);
    for (let i = 0; i <= N; i++) { const y = 0.3 + i * H; L.seg(dx - 0.9, y, maxZ, dx + 0.9, y, maxZ); L.seg(dx - 0.4, y - 0.4, maxZ, dx + 0.4, y + 0.4, maxZ); }
    dims.add(L.build(LM.dim));
    const lx = label(`${(maxX - minX).toFixed(2)} m`, { h: 1.1 }); lx.position.set((minX + maxX) / 2, 0.9, dz + 0.2); dims.add(lx);
    const lz = label(`${(maxZ - minZ).toFixed(2)} m`, { h: 1.1 }); lz.position.set(dx + 0.3, 0.9, (minZ + maxZ) / 2); dims.add(lz);
    for (let i = 0; i <= N; i++) { const s = label(`+${(i * H).toFixed(2)}`, { h: 0.95, color: i === N ? '#E6CD92' : '#C5A059' }); s.position.set(dx + 2.6, 0.3 + i * H, maxZ); s.userData.level = i; dims.add(s); }
  }
  world.add(dims);
  const dimSprites = dims.children.filter((c) => c.isSprite);

  /* ---------- kule vinç ---------- */
  const crane = new THREE.Group();
  {
    const L = new Lines(), s = 1.6, hM = 32, step = 2, cx = 17, cz = -13;
    for (let y = 0; y < hM; y += step) {
      const y1 = y + step, c = [[cx - s / 2, cz - s / 2], [cx + s / 2, cz - s / 2], [cx + s / 2, cz + s / 2], [cx - s / 2, cz + s / 2]];
      for (let k = 0; k < 4; k++) { const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4]; L.seg(ax, y, az, ax, y1, az); L.seg(ax, y, az, bx, y, bz); L.seg(ax, y, az, bx, y1, bz); }
    }
    const jy = hM, jl = 30, cj = 9;
    for (let x = 0; x < jl; x += 2) { const ht = jy + 1.4 - (x + 2) / jl * 1.2; L.seg(cx - x, jy, cz - 0.6, cx - x - 2, jy, cz - 0.6); L.seg(cx - x, jy, cz + 0.6, cx - x - 2, jy, cz + 0.6); L.seg(cx - x, jy, cz - 0.6, cx - x - 2, ht, cz); L.seg(cx - x - 2, jy, cz + 0.6, cx - x - 2, ht, cz); }
    for (let x = 0; x < cj; x += 1.5) { L.seg(cx + x, jy, cz - 0.7, cx + x + 1.5, jy, cz - 0.7); L.seg(cx + x, jy, cz + 0.7, cx + x + 1.5, jy, cz + 0.7); }
    L.seg(cx, jy, cz, cx, jy + 6, cz); L.seg(cx, jy + 6, cz, cx - jl, jy + 0.2, cz); L.seg(cx, jy + 6, cz, cx + cj, jy + 0.2, cz);
    L.box(cx + cj - 1.2, jy - 0.9, cz, 2.2, 1.6, 1.6); L.seg(cx - 18, jy, cz, cx - 18, 14, cz); L.box(cx - 18, 13.2, cz, 0.6, 1.4, 0.6);
    crane.add(L.build(LM.crane));
  }
  world.add(crane);

  /* ---------- ışıklar ---------- */
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a2e22, 0.3);
  const sun = new THREE.DirectionalLight(0xffd2a1, 0);
  sun.castShadow = !mobile; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 180 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  const moon = new THREE.DirectionalLight(0x8fa6d6, 0); moon.position.set(-30, 40, -20);
  scene.add(hemi, sun, sun.target, moon);
  const SUN_DIR = new THREE.Vector3(-22, 24, 56).normalize();
  sky.material.uniforms.uSunDir.value.copy(SUN_DIR);

  // şeffaf (cam, korkuluk) ve ışıyan (iç hacim, bant) yüzeyler gölge almaz → tarama/acne yok
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.transparent || m.side === THREE.BackSide || m === M.band || m === M.lampHead || m === M.water) { o.receiveShadow = false; o.castShadow = o.castShadow && !m.transparent; }
  });

  /* ---------- bloom (yalnız masaüstü) ---------- */
  let composer = null, bloom = null;
  if (!mobile) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.4, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ---------- kamera yolu ---------- */
  const camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(52, 66, 52), new THREE.Vector3(52, 44, 60), new THREE.Vector3(-44, 27, 56),
    new THREE.Vector3(-40, 13, 46), new THREE.Vector3(18, 3.2, 60),
  ], false, 'catmullrom', 0.35);
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, 9, 0), new THREE.Vector3(0, 10, 1), new THREE.Vector3(1, 10.5, 1), new THREE.Vector3(1, 12.5, 0),
  ]);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  /* ---------- boyut ---------- */
  let W = 1, Hh = 1, isPortrait = false;
  const resize = () => {
    const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); Hh = Math.max(1, r.height); isPortrait = W / Hh < 0.9;
    renderer.setSize(W, Hh, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(W, Hh); }
    camera.aspect = W / Hh;
    if (!mobile && W > 900) camera.setViewOffset(W, Hh, -W * 0.19, 0, W, Hh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  resize(); new ResizeObserver(resize).observe(stage);

  /* ---------- HUD ---------- */
  const hud = {
    phase: section.querySelector('[data-vz-phase]'), scale: section.querySelector('[data-vz-scale]'),
    level: section.querySelector('[data-vz-level]'), sheet: section.querySelector('[data-vz-sheet]'),
    fills: [...section.querySelectorAll('.vz-track s')], panels: [...section.querySelectorAll('.vz-panel')], steps: [...section.querySelectorAll('.vz-track button')],
  };
  const PHASES = ['Eskiz', 'Strüktür', 'Cephe · İç mimari', 'Yaşayan mekân'];
  const SCALES = ['1:500', '1:200', '1:100', '1:50'];
  let lastPhase = -1, lastPct = -1, lastLvl = '';

  /* ---------- kaydırma ---------- */
  let target = 0, cur = 0;
  const st = ScrollTrigger.create({ trigger: section, start: 'top top', end: 'bottom bottom', onUpdate: (s) => { target = s.progress; } });
  target = cur = st.progress || 0;
  let mx = 0, my = 0, smx = 0, smy = 0;
  if (!mobile) addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  hud.steps.forEach((b, i) => b.addEventListener('click', () => {
    const y = section.getBoundingClientRect().top + scrollY + (section.offsetHeight - innerHeight) * (i * 0.25 + 0.13);
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.8 }); else scrollTo({ top: y, behavior: 'smooth' });
  }));

  /* ---------- güncelleme ---------- */
  const tmpC = new THREE.Color(), tmpO = new THREE.Object3D();
  const SLAB_DAY = new THREE.Color(0xffffff), SLAB_NIGHT = new THREE.Color(0xb3a996);
  let lastShadowP = -1, envMode = 'day';

  const sway = (mesh, list, y, time) => {
    list.forEach((t, i) => {
      tmpO.position.set(t.x, y, t.z);
      tmpO.rotation.set(Math.sin(time * 0.9 + t.ph) * 0.025, t.ry, Math.cos(time * 0.7 + t.ph) * 0.025);
      tmpO.scale.setScalar(t.s); tmpO.updateMatrix(); mesh.setMatrixAt(i, tmpO.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  function update(p, time) {
    const t1 = seg(p, 0.0, 0.24), t2 = seg(p, 0.22, 0.5), t3 = seg(p, 0.48, 0.76), t4 = seg(p, 0.74, 0.98);
    const e3 = ease(t3), e4 = ease(t4);

    floors.forEach((fl, i) => {
      const a = i / (TOTAL + 0.6), k = ease(seg(t1, a, a + 1.6 / (TOTAL + 0.6)));
      fl.goldL.geometry.setDrawRange(0, Math.floor(fl.goldL.userData.count * k / 2) * 2);
      fl.blueL.geometry.setDrawRange(0, Math.floor(fl.blueL.userData.count * clamp(k * 1.2 - 0.2) / 2) * 2);
      const s0 = (i / TOTAL) * 0.72, ks = ease(seg(t2, s0, s0 + 0.28));
      fl.struct.visible = ks > 0.001; fl.struct.scale.y = Math.max(0.0001, ks);
      const f0 = (i / TOTAL) * 0.55, kf = ease(seg(t3, f0, f0 + 0.45));
      fl.facade.visible = kf > 0.001; fl.facade.scale.y = Math.max(0.0001, kf);
      fl.interior.visible = kf > 0.6;
    });

    // çizgiler sönümlenir
    LM.gold.opacity = lerp(1, 0.06, e3) * (1 - 0.6 * t4);
    LM.blue.opacity = lerp(0.6, 0.03, e3);
    LM.dim.opacity = lerp(0.75, 0, ease(seg(t3, 0, 0.6)));
    const labelOp = 1 - ease(seg(t3, 0, 0.6));
    dimSprites.forEach((s) => {
      const on = s.userData.level === undefined ? 1 : ease(seg(t1, s.userData.level / (N + 1), (s.userData.level + 1) / (N + 1)));
      s.material.opacity = on * labelOp; s.visible = s.material.opacity > 0.01;
    });
    compass.visible = LM.dim.opacity > 0.01; compass.rotation.y = time * 0.03;
    compassSprites.forEach((s) => { s.material.opacity = LM.dim.opacity; });
    gridMajor.material.opacity = lerp(0.32, 0, e3); gridMinor.material.opacity = lerp(0.22, 0, e3);
    gridMajor.visible = gridMinor.visible = gridMajor.material.opacity > 0.005;

    // peyzaj
    const ks = ease(seg(t3, 0, 0.45));
    site.visible = ks > 0.001; site.scale.y = Math.max(0.0001, ks);
    if (site.visible) { sway(planeLeaves, trees.plane, 4.6, time); sway(cypLeaves, trees.cyp, 2.1, time); }

    LM.crane.opacity = ease(seg(t2, 0, 0.25)) * (1 - ease(seg(t3, 0.1, 0.5)));
    crane.visible = LM.crane.opacity > 0.01; crane.rotation.y = Math.sin(time * 0.25) * 0.08;

    // gökyüzü: CAD karanlığı → altın saat → gece
    const u = sky.material.uniforms;
    u.uTop.value.copy(SKY.cad.top).lerp(SKY.gold.top, e3).lerp(SKY.night.top, e4);
    u.uHor.value.copy(SKY.cad.hor).lerp(SKY.gold.hor, e3).lerp(SKY.night.hor, e4);
    u.uBot.value.copy(SKY.cad.bot).lerp(SKY.gold.bot, e3).lerp(SKY.night.bot, e4);
    u.uSun.value = e3 * (1 - e4);
    scene.fog.color.copy(u.uHor.value).lerp(u.uBot.value, 0.35);
    scene.fog.near = lerp(90, 70, e3); scene.fog.far = lerp(300, 240, e3);

    const wantEnv = t4 > 0.5 ? 'night' : 'day';
    if (wantEnv !== envMode) { envMode = wantEnv; scene.environment = ENV[envMode]; }
    const envAmt = lerp(0.25, 1, e3) * (t4 > 0.5 ? 1 : 1 - t4 * 0.6);

    // materyaller
    M.glass.opacity = lerp(0, 0.62, e3) * (1 - 0.3 * e4);
    M.glass.envMapIntensity = 2.4 * envAmt;
    M.rail.opacity = 0.22 * e3;
    M.roomLit.emissiveIntensity = 0.04 * t3 + 0.5 * e4;
    M.roomDim.emissiveIntensity = 0.02 * t3 + 0.16 * e4;
    M.band.emissiveIntensity = 0.3 * t3 + 1.35 * e4;
    M.water.emissiveIntensity = 0.15 * e3 + 1.4 * e4;
    M.lampHead.emissiveIntensity = 1.1 * e4;
    M.slab.color.copy(SLAB_DAY).lerp(SLAB_NIGHT, e4);
    M.leaf.color.setScalar(lerp(1, 0.55, e4));

    // ışık
    sun.intensity = 3.4 * ease(seg(t3, 0, 0.6)) * (1 - 0.95 * e4);
    sun.position.copy(SUN_DIR).multiplyScalar(80); sun.target.position.set(0, 6, 0);
    hemi.intensity = 0.3 + 0.75 * e3 - 0.9 * e4;
    hemi.color.set(0xcfe0ff).lerp(tmpC.set(0x6f7fa8), e4);
    moon.intensity = 1.1 * e4;
    nightLights.forEach((l) => { l.intensity = 14 * e4; });
    renderer.toneMappingExposure = 1.0 + 0.22 * e3 - 0.12 * e4;
    if (bloom) { bloom.strength = 0.32 * e4; bloom.threshold = 0.92; bloom.radius = 0.4; }

    // gölge haritasını yalnız sahne değişirken güncelle
    if (renderer.shadowMap.enabled && t3 > 0 && Math.abs(p - lastShadowP) > 0.0015) { renderer.shadowMap.needsUpdate = true; lastShadowP = p; }

    // kamera
    camPath.getPoint(p, camPos); lookPath.getPoint(p, camLook);
    if (isPortrait) { camPos.multiplyScalar(1.42); camLook.y -= 4.5 * (1 - p * 0.5); }
    camPos.y = Math.max(1.6, camPos.y);
    smx += (mx - smx) * 0.04; smy += (my - smy) * 0.04;
    camPos.x += Math.sin(time * 0.12) * 0.8 + smx * 4; camPos.y += smy * -2;
    camera.position.copy(camPos); camera.lookAt(camLook);

    // HUD
    const phase = Math.min(3, Math.floor(p * 4 + 0.0001));
    if (phase !== lastPhase) {
      lastPhase = phase; hud.phase.textContent = PHASES[phase]; hud.scale.textContent = SCALES[phase];
      hud.sheet.innerHTML = `0${phase + 1}<i>/04</i>`;
      hud.panels.forEach((el, i) => el.classList.toggle('is-on', i === phase));
      hud.steps.forEach((el, i) => el.classList.toggle('is-on', i === phase));
      section.dataset.phase = phase;
    }
    const pct = Math.round(p * 100);
    if (pct !== lastPct) { lastPct = pct; hud.fills.forEach((f, k) => { f.style.transform = `scaleY(${clamp(p * 4 - k)})`; }); }
    const lvl = '+' + (Math.min(N, Math.floor((p < 0.25 ? t1 : t2 < 1 ? t2 : 1) * (N + 0.999))) * H).toFixed(2);
    if (lvl !== lastLvl) { lastLvl = lvl; hud.level.textContent = lvl; }
    return t4;
  }

  /* ---------- döngü: yalnız görünürken, uyarlanır çözünürlük ---------- */
  const clock = new THREE.Clock();
  let running = false, acc = 0, frames = 0;
  const frame = () => {
    const dt = Math.min(0.05, clock.getDelta());
    cur += (target - cur) * (1 - Math.pow(1 - 0.05, dt * 60));
    if (Math.abs(target - cur) < 0.00005) cur = target;
    const t4 = update(cur, clock.elapsedTime);
    if (composer && t4 > 0.01) composer.render(); else renderer.render(scene, camera);
    // FPS düşerse piksel yoğunluğunu kademeli düşür, toparlanırsa geri yükselt
    acc += dt; frames++;
    if (acc > 1.2) {
      const fps = frames / acc; acc = 0; frames = 0;
      const next = fps < 45 ? Math.max(1, dpr - 0.25) : fps > 58 ? Math.min(maxDpr, dpr + 0.125) : dpr;
      if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); resize(); }
    }
  };
  const start = () => { if (running) return; running = true; clock.getDelta(); acc = 0; frames = 0; renderer.setAnimationLoop(frame); };
  const stop = () => { running = false; renderer.setAnimationLoop(null); };
  new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { rootMargin: '10% 0px' }).observe(section);

  update(cur, 0);
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  section.classList.add('is-ready');
}
