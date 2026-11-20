// Hotel Valle de Cocora en 3D: casa de estilo colonial de Salento con patio central, galerías de madera,
// 38 habitaciones en dos pisos (capacidad real del caso), palmas de cera y montañas con neblina.
// Este módulo define a la vez la geometría (lo que se ve) y la navegación (por dónde se puede caminar).
import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const H = 3.6;            // altura de cada piso
export const OJOS = 1.62;        // altura de los ojos del visitante

const PALETA = ['#b8312f', '#1f6fb2', '#e0a526', '#2e8b57', '#7d3c98', '#d35400', '#138d75', '#2c3e70', '#c0392b', '#2471a3'];

// ---------------------------------------------------------------- distribución
export function crearLayout() {
  const habitaciones = [];
  for (let piso = 1; piso <= 2; piso++) {
    const y = (piso - 1) * H;
    let n = 1;
    const add = (ala, x0, x1, z0, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let puerta, frente, giro;
      if (ala === 'norte') { puerta = { x: cx, z: -11 }; frente = { x: cx, z: -9.5 }; giro = 0; }
      if (ala === 'sur') { puerta = { x: cx, z: 11 }; frente = { x: cx, z: 9.5 }; giro = Math.PI; }
      if (ala === 'oeste') { puerta = { x: -15, z: cz }; frente = { x: -13.5, z: cz }; giro = -Math.PI / 2; }
      if (ala === 'este') { puerta = { x: 15, z: cz }; frente = { x: 13.5, z: cz }; giro = Math.PI / 2; }
      const num = `${piso}${String(n).padStart(2, '0')}`;
      habitaciones.push({ num, piso, y, ala, x0, x1, z0, z1, cx, cz, puerta, frente, giro, color: PALETA[(n * 3 + piso) % PALETA.length] });
      n++;
    };
    add('sur', -14, -10, 11, 16);
    for (const z0 of [6, 2, -2, -6, -10]) add('oeste', -20, -15, z0, z0 + 4);
    for (let i = 0; i < 7; i++) add('norte', -14 + 4 * i, -10 + 4 * i, -16, -11);
    for (const z0 of [-10, -6, -2, 2, 6]) add('este', 15, 20, z0, z0 + 4);
    add('sur', 10, 14, 11, 16);
  }

  // Regiones caminables: rectángulos con altura (plana o en rampa para la escalera)
  const regiones = [];
  const rect = (x0, x1, z0, z1, y, nombre) => regiones.push({ x0, x1, z0, z1, y, nombre });
  for (const piso of [1, 2]) {
    const y = (piso - 1) * H;
    rect(-15, 15, -11, -8, y, 'galeria');
    rect(-15, 15, 8, 11, y, 'galeria');
    rect(-15, -12, -11, 11, y, 'galeria');
    rect(12, 15, -11, 11, y, 'galeria');
  }
  rect(-12, 12, -8, 8, 0, 'patio');
  rect(-10, 10, 11, 14.3, 0, 'lobby');
  rect(-2.3, 10, 14.3, 15.75, 0, 'lobby');
  rect(-10, -8.6, 14.3, 15.75, 0, 'lobby');
  rect(-1.4, 1.4, 15.7, 16.3, 0, 'puerta');
  rect(-26, 26, 16.25, 34, 0, 'plaza');
  rect(-10, 10, 11, 14.3, H, 'salon');
  rect(-2.3, 10, 14.3, 15.75, H, 'salon');
  rect(-10, -8.6, 14.3, 15.75, H, 'salon');
  // Escalera: sube de x=-2.3 (piso 1) a x=-8.6 (piso 2)
  regiones.push({ x0: -8.6, x1: -2.3, z0: 14.3, z1: 15.7, nombre: 'escalera', rampa: x => H * THREE.MathUtils.clamp((-2.3 - x) / 6.3, 0, 1) });

  const obstaculos = [
    { x: 0, z: 0, r: 2.5, y: 0 },
    { x: 7, z: 4.5, r: 1.2, y: 0 }, { x: -7, z: 4.5, r: 1.2, y: 0 }, { x: 7, z: -4.5, r: 1.2, y: 0 }, { x: -7, z: -4.5, r: 1.2, y: 0 },
    { rect: [3, 8, 13.4, 14.6], y: 0 }, // mostrador de recepción
  ];
  for (const piso of [1, 2]) for (const c of columnas()) obstaculos.push({ x: c.x, z: c.z, r: 0.32, y: (piso - 1) * H });
  for (const p of palmasPlaza()) obstaculos.push({ x: p.x, z: p.z, r: 0.6, y: 0 });
  for (const x of [-2.4, 2.4]) obstaculos.push({ x, z: 17.6, r: .25, y: 0 });
  for (const x of [-2.0, 2.0]) obstaculos.push({ x, z: 16.75, r: .45, y: 0 });
  for (const x of [-6.5, 6.5]) obstaculos.push({ rect: [x - 1, x + 1, 19.6, 20.1], y: 0 });

  // Grafo de navegación
  const nodos = [], aristas = new Map();
  const nodo = (id, x, y, z, extra = {}) => { nodos.push({ id, x, y, z, ...extra }); aristas.set(id, []); return id; };
  const unir = (a, b) => {
    const A = nodos.find(n => n.id === a), B = nodos.find(n => n.id === b);
    const d = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
    aristas.get(a).push([b, d]); aristas.get(b).push([a, d]);
  };
  nodo('plaza', 0, 0, 26, { zona: 'fuera' }); nodo('entrada', 0, 0, 18, { zona: 'fuera' }); nodo('puerta', 0, 0, 16, { zona: 'fuera' });
  nodo('lobby', 0, 0, 13, { zona: 'lobby' }); nodo('esc-abajo', -1.8, 0, 15, { zona: 'lobby' });
  nodo('esc-arriba', -9.2, H, 15, { zona: 'escalera' }); nodo('salon', -9.2, H, 12.6, { zona: 'salon' });
  unir('plaza', 'entrada'); unir('entrada', 'puerta'); unir('puerta', 'lobby'); unir('lobby', 'esc-abajo'); unir('puerta', 'esc-abajo');
  unir('esc-abajo', 'esc-arriba'); unir('esc-arriba', 'salon');
  const perim = (x, z) => {
    if (Math.abs(z + 9.5) < .01) return x + 13.5;
    if (Math.abs(x - 13.5) < .01) return 27 + (z + 9.5);
    if (Math.abs(z - 9.5) < .01) return 46 + (13.5 - x);
    return 73 + (9.5 - z);
  };
  for (const piso of [1, 2]) {
    const y = (piso - 1) * H;
    const anillo = [];
    for (const [x, z] of [[-13.5, -9.5], [13.5, -9.5], [13.5, 9.5], [-13.5, 9.5]]) anillo.push(nodo(`g${piso}:${x},${z}`, x, y, z, { zona: 'galeria' }));
    for (const h of habitaciones.filter(h => h.piso === piso)) {
      anillo.push(nodo(`f${h.num}`, h.frente.x, y, h.frente.z, { zona: 'galeria', hab: h.num }));
      nodo(`p${h.num}`, h.puerta.x, y, h.puerta.z, { zona: 'puerta', hab: h.num });
      unir(`f${h.num}`, `p${h.num}`);
    }
    const enlace = piso === 1 ? nodo('g1:0,9.5', 0, 0, 9.5, { zona: 'galeria' }) : nodo('g2:-9.2,9.5', -9.2, H, 9.5, { zona: 'galeria' });
    anillo.push(enlace);
    unir(enlace, piso === 1 ? 'lobby' : 'salon');
    anillo.sort((a, b) => { const A = nodos.find(n => n.id === a), B = nodos.find(n => n.id === b); return perim(A.x, A.z) - perim(B.x, B.z); });
    anillo.forEach((id, i) => unir(id, anillo[(i + 1) % anillo.length]));
  }

  return { habitaciones, regiones, obstaculos, nodos, aristas };
}

export function columnas() {
  const c = [];
  for (let x = -12; x <= 12; x += 4) { c.push({ x, z: -8 }); c.push({ x, z: 8 }); }
  for (let z = -4; z <= 4; z += 4) { c.push({ x: -12, z }); c.push({ x: 12, z }); }
  return c;
}

function palmasPlaza() {
  return [{ x: -9, z: 21, h: 17 }, { x: 9, z: 21, h: 19 }, { x: -17, z: 27, h: 22 }, { x: 18, z: 29, h: 21 }, { x: -6, z: 32, h: 24 },
    { x: -2.8, z: 23.5, h: 15 }, { x: 2.8, z: 24.5, h: 18 }];
}

// ---------------------------------------------------------------- navegación
function alturaRegion(r, x) { return r.rampa ? r.rampa(x) : r.y; }

export function regionEn(L, x, z, y, puertasAbiertas) {
  let mejor = null, dmin = 0.75;
  const probar = (r) => {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return;
    const ry = alturaRegion(r, x), d = Math.abs(ry - y);
    if (d < dmin) { dmin = d; mejor = { ...r, ry }; }
  };
  L.regiones.forEach(probar);
  if (puertasAbiertas) for (const num of puertasAbiertas) {
    const h = L.habitaciones.find(h => h.num === num);
    if (!h) continue;
    for (const r of regionesHabitacion(h)) probar(r);
  }
  if (!mejor) return null;
  for (const o of L.obstaculos) {
    if (Math.abs(o.y - mejor.ry) > 1) continue;
    if (o.rect) { const [a, b, c, d] = o.rect; if (x > a - .3 && x < b + .3 && z > c - .3 && z < d + .3) return null; }
    else if (Math.hypot(x - o.x, z - o.z) < o.r + 0.3) return null;
  }
  return mejor;
}

export function regionesHabitacion(h) {
  const m = 0.45, y = h.y;
  const dentro = { x0: h.x0 + m, x1: h.x1 - m, z0: h.z0 + m, z1: h.z1 - m, y, nombre: 'hab' };
  const { x, z } = h.puerta;
  const conector = (h.ala === 'norte' || h.ala === 'sur')
    ? { x0: x - .5, x1: x + .5, z0: z - .7, z1: z + .7, y, nombre: 'umbral' }
    : { x0: x - .7, x1: x + .7, z0: z - .5, z1: z + .5, y, nombre: 'umbral' };
  return [dentro, conector];
}

// Mueve al visitante deslizándose contra paredes. pos = {x,y,z}
export function mover(L, pos, dx, dz, abiertas) {
  const intentar = (nx, nz) => {
    const r = regionEn(L, nx, nz, pos.y, abiertas);
    return r ? { x: nx, z: nz, y: r.ry } : null;
  };
  const p = intentar(pos.x + dx, pos.z + dz) || intentar(pos.x + dx, pos.z) || intentar(pos.x, pos.z + dz);
  if (p) { pos.x = p.x; pos.z = p.z; pos.y = p.y; }
  return pos;
}

function hayLinea(L, a, b, abiertas) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), pasos = Math.max(2, Math.ceil(d / 0.4));
  let y = a.y;
  for (let i = 1; i < pasos; i++) {
    const t = i / pasos, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const r = regionEn(L, x, z, y, abiertas) || regionEn(L, x, z, a.y + (b.y - a.y) * t, abiertas);
    if (!r) return false;
    y = r.ry;
  }
  return Math.abs(y - b.y) < 0.9;
}

// Distancias desde la puerta destino (Dijkstra inverso) para guiar sin retroceder
export function prepararDestino(L, num) {
  const dist = new Map(L.nodos.map(n => [n.id, Infinity])), sig = new Map();
  const origen = `p${num}`;
  dist.set(origen, 0);
  const pend = new Set(L.nodos.map(n => n.id));
  while (pend.size) {
    let u = null, du = Infinity;
    for (const id of pend) if (dist.get(id) < du) { du = dist.get(id); u = id; }
    if (u === null) break;
    pend.delete(u);
    for (const [v, w] of L.aristas.get(u)) if (du + w < dist.get(v)) { dist.set(v, du + w); sig.set(v, u); }
  }
  return { num, dist, sig };
}

export function ruta(L, destino, pos, abiertas) {
  const h = L.habitaciones.find(h => h.num === destino.num);
  const puerta = { x: h.puerta.x, y: h.y, z: h.puerta.z };
  // ¿Ya está dentro o en el umbral de su habitación?
  if (Math.abs(pos.y - h.y) < 1 && pos.x > h.x0 && pos.x < h.x1 && pos.z > h.z0 - .8 && pos.z < h.z1 + .8 &&
      Math.hypot(pos.x - puerta.x, pos.z - puerta.z) < 1.2) return { puntos: [pos, puerta], distancia: Math.hypot(pos.x - puerta.x, pos.z - puerta.z), siguiente: null };
  let mejor = null;
  for (const n of L.nodos) {
    const dn = destino.dist.get(n.id);
    if (!isFinite(dn) || Math.abs(n.y - pos.y) > 4) continue;
    if (n.zona === 'puerta') continue; // se llega a la puerta siempre de frente, pasando por el nodo de enfrente
    const d = Math.hypot(n.x - pos.x, n.z - pos.z, n.y - pos.y);
    if (d > 26) continue;
    const total = d + dn;
    if (mejor && total >= mejor.total) continue;
    if (!hayLinea(L, pos, n, abiertas)) continue;
    mejor = { n, total };
  }
  if (!mejor) return null;
  const puntos = [{ x: pos.x, y: pos.y, z: pos.z }];
  let id = mejor.n.id;
  while (id) {
    const n = L.nodos.find(k => k.id === id);
    puntos.push({ x: n.x, y: n.y, z: n.z, id: n.id, zona: n.zona });
    id = destino.sig.get(id);
  }
  return { puntos, distancia: mejor.total, siguiente: mejor.n };
}

// ---------------------------------------------------------------- texturas
function lienzo(w, h, dibujar) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dibujar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function texturaBaldosa() {
  const t = lienzo(256, 256, (g, w) => {
    g.fillStyle = '#b8643c'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 180 + Math.random() * 30 | 0;
      g.fillStyle = `rgb(${v},${v * .52 | 0},${v * .33 | 0})`;
      g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function texturaPiedra() {
  const t = lienzo(256, 256, (g, w) => {
    g.fillStyle = '#6f6a62'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 90; i++) {
      const v = 120 + Math.random() * 50 | 0;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * w, 10 + Math.random() * 10, 8 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function texturaPasto() {
  const t = lienzo(256, 256, (g, w) => {
    g.fillStyle = '#5d8a3a'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `hsl(${85 + Math.random() * 25},45%,${28 + Math.random() * 18}%)`; g.fillRect(Math.random() * w, Math.random() * w, 2, 3); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function texturaTeja() {
  const t = lienzo(128, 128, (g, w) => {
    g.fillStyle = '#9c4126'; g.fillRect(0, 0, w, w);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      g.fillStyle = (i + j) % 2 ? '#b4532f' : '#a84a2a';
      g.beginPath(); g.ellipse(i * 16 + (j % 2) * 8, j * 16 + 10, 8, 9, 0, 0, Math.PI); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function textoTextura(lineas, { ancho = 512, alto = 256, fondo = '#f4efe4', color = '#2b2118', borde = null, fuente = 'bold 64px Georgia, serif' } = {}) {
  return lienzo(ancho, alto, (g, w, h) => {
    g.fillStyle = fondo; g.fillRect(0, 0, w, h);
    if (borde) { g.strokeStyle = borde; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const arr = Array.isArray(lineas) ? lineas : [lineas];
    arr.forEach((l, i) => {
      g.font = typeof l === 'object' ? l.fuente : fuente;
      g.fillText(typeof l === 'object' ? l.t : l, w / 2, h * (i + 0.5) / arr.length);
    });
  });
}

// ---------------------------------------------------------------- construcción
export function construirHotel(scene, { modo = 'huesped', calidad = 'alta' } = {}) {
  const L = crearLayout();
  const recep = modo === 'recepcion';
  const HM = recep ? 1.3 : H; // en recepción las paredes se cortan como en una maqueta
  const raiz = new THREE.Group(); scene.add(raiz);
  const piso1 = new THREE.Group(), piso2 = new THREE.Group(), techo = new THREE.Group(), exterior = new THREE.Group();
  raiz.add(piso1, piso2, techo, exterior);
  // En recepción, la parte alta de las paredes va aparte: se oculta en la vista de maqueta y se muestra en "Hotel completo"
  const alto1 = new THREE.Group(), alto2 = new THREE.Group(); piso1.add(alto1); piso2.add(alto2);
  const altoDe = g => g === piso1 ? alto1 : g === piso2 ? alto2 : g;

  const tBaldosa = texturaBaldosa(), tPiedra = texturaPiedra(), tPasto = texturaPasto(), tTeja = texturaTeja();
  const mat = {
    pared: new THREE.MeshLambertMaterial({ color: '#f1ebdf' }),
    paredInt: new THREE.MeshLambertMaterial({ color: '#efe3cf' }),
    zocalo: new THREE.MeshLambertMaterial({ color: '#2f6f4f' }),
    madera: new THREE.MeshLambertMaterial({ color: '#5b351c' }),
    maderaClara: new THREE.MeshLambertMaterial({ color: '#8a5a32' }),
    baldosa: new THREE.MeshLambertMaterial({ map: tBaldosa }),
    piedra: new THREE.MeshLambertMaterial({ map: tPiedra }),
    pasto: new THREE.MeshLambertMaterial({ map: tPasto }),
    teja: new THREE.MeshLambertMaterial({ map: tTeja, side: THREE.DoubleSide }),
    vidrio: new THREE.MeshLambertMaterial({ color: '#9fc4d8', transparent: true, opacity: .55 }),
    agua: new THREE.MeshLambertMaterial({ color: '#4f8fb0', emissive: '#16384a' }),
    blancoCama: new THREE.MeshLambertMaterial({ color: '#fbf8f2' }),
    cobija: new THREE.MeshLambertMaterial({ color: '#b5462f' }),
    tronco: new THREE.MeshLambertMaterial({ color: '#d9d6cc' }),
    hoja: new THREE.MeshLambertMaterial({ color: '#4b7d2f', side: THREE.DoubleSide }),
    montana: new THREE.MeshLambertMaterial({ color: '#3f6b3a', flatShading: true }),
    montana2: new THREE.MeshLambertMaterial({ color: '#5a8150', flatShading: true }),
  };
  const colorMats = {};
  const matColor = c => colorMats[c] || (colorMats[c] = new THREE.MeshLambertMaterial({ color: c }));

  // Lotes de geometría estática que se fusionan al final (rendimiento en celular)
  const lotes = new Map();
  const caja = (grupo, material, x0, x1, y0, y1, z0, z1, uv = 1) => {
    const g = new THREE.BoxGeometry(Math.max(x1 - x0, .001), Math.max(y1 - y0, .001), Math.max(z1 - z0, .001));
    if (uv !== 1 || material.map) {
      const u = g.attributes.uv;
      const sx = (x1 - x0) / uv, sy = (y1 - y0) / uv, sz = (z1 - z0) / uv;
      for (let i = 0; i < u.count; i++) {
        const cara = Math.floor(i / 4);
        const [a, b] = cara < 2 ? [sz, sy] : cara < 4 ? [sx, sz] : [sx, sy];
        u.setXY(i, u.getX(i) * a, u.getY(i) * b);
      }
    }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const k = grupo.uuid + material.uuid;
    if (!lotes.has(k)) lotes.set(k, { grupo, material, geos: [] });
    lotes.get(k).geos.push(g);
  };
  const muro = (grupo, material, x0, x1, y0, y1, z0, z1, uv) => {
    if (!recep || (grupo !== piso1 && grupo !== piso2)) return caja(grupo, material, x0, x1, y0, y1, z0, z1, uv);
    const corte = (grupo === piso2 ? H : 0) + HM;
    if (y0 < corte) caja(grupo, material, x0, x1, y0, Math.min(y1, corte), z0, z1, uv);
    if (y1 > corte) caja(altoDe(grupo), material, x0, x1, Math.max(y0, corte), y1, z0, z1, uv);
  };

  // --- suelo, plaza y patio
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(260, 48), mat.pasto);
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.05; tPasto.repeat.set(1, 1);
  suelo.material = mat.pasto.clone(); suelo.material.map = tPasto.clone(); suelo.material.map.repeat.set(70, 70); suelo.material.map.needsUpdate = true;
  suelo.userData.suelo = true;
  exterior.add(suelo);
  caja(exterior, mat.piedra, -26, 26, -0.04, 0, 16, 34, 3);
  caja(exterior, mat.piedra, -1.6, 1.6, -0.04, 0.001, 34, 70, 3); // camino de llegada
  caja(piso1, mat.pasto, -12, 12, -0.04, 0.0, -8, 8, 4);
  caja(piso1, mat.piedra, -1.2, 1.2, 0, 0.02, -8, 8, 2);
  caja(piso1, mat.piedra, -12, 12, 0, 0.02, -1.2, 1.2, 2);

  // fuente central
  const fuente = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, .6, 24), mat.piedra); base.position.y = .3;
  const agua = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, .1, 24), mat.agua); agua.position.y = .58;
  const pilar = new THREE.Mesh(new THREE.CylinderGeometry(.25, .35, 1.6, 12), mat.piedra); pilar.position.y = 1.1;
  const taza = new THREE.Mesh(new THREE.CylinderGeometry(.9, .4, .35, 18), mat.piedra); taza.position.y = 1.9;
  fuente.add(base, agua, pilar, taza); piso1.add(fuente);
  // jardineras con plantas
  for (const [x, z] of [[7, 4.5], [-7, 4.5], [7, -4.5], [-7, -4.5]]) {
    caja(piso1, mat.zocalo, x - 1, x + 1, 0, .5, z - 1, z + 1);
    const arbusto = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), matColor('#3c7a35'));
    arbusto.position.set(x, 1.1, z); arbusto.scale.set(1, .9, 1); piso1.add(arbusto);
    for (let i = 0; i < 5; i++) {
      const flor = new THREE.Mesh(new THREE.IcosahedronGeometry(.18, 0), matColor(['#e84a6f', '#f2c230', '#ffffff', '#e86a2f'][i % 4]));
      flor.position.set(x + Math.cos(i * 1.3) * .8, 1.3 + (i % 2) * .4, z + Math.sin(i * 1.3) * .8); piso1.add(flor);
    }
  }

  // --- pisos (losas)
  for (const piso of [1, 2]) {
    const g = piso === 1 ? piso1 : piso2, y = (piso - 1) * H;
    const e = piso === 1 ? 0.0 : 0.3;
    // galerías
    caja(g, mat.baldosa, -15, 15, y - e - .02, y + .02, -11, -8, 1.2);
    caja(g, mat.baldosa, -15, 15, y - e - .02, y + .02, 8, 11, 1.2);
    caja(g, mat.baldosa, -15, -12, y - e - .02, y + .02, -8, 8, 1.2);
    caja(g, mat.baldosa, 12, 15, y - e - .02, y + .02, -8, 8, 1.2);
    // lobby / salón (con hueco de escalera en el piso 2)
    if (piso === 1) caja(g, mat.baldosa, -10, 10, -.02, .02, 11, 16, 1.2);
    else {
      caja(g, mat.baldosa, -10, 10, y - e, y + .02, 11, 14.3, 1.2);
      caja(g, mat.baldosa, -2.3, 10, y - e, y + .02, 14.3, 16, 1.2);
      caja(g, mat.baldosa, -10, -8.6, y - e, y + .02, 14.3, 16, 1.2);
      // baranda del hueco de escalera
      caja(g, mat.madera, -8.6, -2.3, y, y + 1, 14.2, 14.3);
    }
    // bloques de esquina (macizos)
    for (const [x0, x1, z0, z1] of [[-20, -15, -16, -10], [-15, -14, -16, -11], [15, 20, -16, -10], [14, 15, -16, -11],
      [-20, -15, 10, 16], [-15, -14, 11, 16], [15, 20, 10, 16], [14, 15, 11, 16]]) {
      muro(g, mat.pared, x0, x1, y, y + H, z0, z1);
    }
    // zócalo de color en las paredes de la galería
  }

  // --- columnas y barandas de la galería (madera)
  for (const c of columnas()) {
    caja(piso1, mat.piedra, c.x - .3, c.x + .3, 0, .4, c.z - .3, c.z + .3);
    caja(piso1, mat.madera, c.x - .16, c.x + .16, .4, H - .3, c.z - .16, c.z + .16);
    caja(piso1, mat.maderaClara, c.x - .35, c.x + .35, H - .3, H - .1, c.z - .35, c.z + .35);
    caja(piso2, mat.madera, c.x - .14, c.x + .14, H, 2 * H - .3, c.z - .14, c.z + .14);
    caja(piso2, mat.maderaClara, c.x - .3, c.x + .3, 2 * H - .3, 2 * H - .15, c.z - .3, c.z + .3);
  }
  // vigas de borde (aleros de la galería)
  for (const g of [piso1, piso2]) {
    const y = g === piso1 ? H - .35 : 2 * H - .35;
    caja(g, mat.madera, -12.2, 12.2, y, y + .25, -8.12, -7.88);
    caja(g, mat.madera, -12.2, 12.2, y, y + .25, 7.88, 8.12);
    caja(g, mat.madera, -12.12, -11.88, y, y + .25, -8, 8);
    caja(g, mat.madera, 11.88, 12.12, y, y + .25, -8, 8);
  }
  // baranda del piso 2 hacia el patio, con balaustres de colores
  const yb = H;
  const baranda = (x0, x1, z0, z1) => {
    caja(piso2, mat.maderaClara, x0, x1, yb + .95, yb + 1.05, z0, z1);
    caja(piso2, mat.maderaClara, x0, x1, yb + .05, yb + .15, z0, z1);
    const largo = Math.max(x1 - x0, z1 - z0), n = Math.floor(largo / .45);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 - x0 > z1 - z0 ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
      const z = x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
      caja(piso2, mat.zocalo, x - .03, x + .03, yb + .15, yb + .95, z - .03, z + .03);
    }
  };
  baranda(-12, 12, -8.06, -7.94); baranda(-12, 12, 7.94, 8.06); baranda(-12.06, -11.94, -8, 8); baranda(11.94, 12.06, -8, 8);
  // techo plano bajo el piso 2 (cielo raso de la galería del piso 1) ya lo da la losa

  // --- escalera del lobby (de x=-2.3 a x=-8.6)
  const escalones = 12;
  for (let i = 0; i < escalones; i++) {
    const x1 = -2.3 - i * 6.3 / escalones, x0 = x1 - 6.3 / escalones;
    caja(piso1, mat.maderaClara, x0, x1, 0, (i + 1) * H / escalones, 14.3, 15.7);
  }
  caja(piso1, mat.madera, -8.6, -2.3, 0, .05, 14.25, 14.3);
  for (let i = 0; i <= 6; i++) { // pasamanos inclinado aproximado con postes
    const x = -2.3 - i * 1.05, y = H * Math.min(1, (i * 1.05) / 6.3);
    caja(piso1, mat.madera, x - .04, x + .04, y, y + 1, 14.22, 14.3);
  }

  // --- habitaciones
  const habitaciones = new Map();
  for (const h of L.habitaciones) habitaciones.set(h.num, construirHabitacion(h));

  function construirHabitacion(h) {
    const g = h.piso === 1 ? piso1 : piso2, y = h.y, t = .14;
    const { x0, x1, z0, z1 } = h;
    const mColor = matColor(h.color);
    // suelo interior
    caja(g, mat.baldosa, x0, x1, y - .02, y + .02, z0, z1, 1.2);
    // paredes: determina cuál lado da a la galería (puerta) y cuál al exterior (ventana)
    const lados = {
      norte: { puerta: 'z1', ventana: 'z0' }, sur: { puerta: 'z0', ventana: 'z1' },
      oeste: { puerta: 'x1', ventana: 'x0' }, este: { puerta: 'x0', ventana: 'x1' },
    }[h.ala];
    const pared = (lado, hueco) => {
      // hueco = {centro, ancho, y0, y1} sobre el eje del lado
      const enX = lado === 'z0' || lado === 'z1';
      const fijo = { x0, x1, z0, z1 }[lado];
      const a0 = enX ? x0 : z0, a1 = enX ? x1 : z1;
      const c0 = lado.endsWith('0') ? fijo : fijo - t, c1 = lado.endsWith('0') ? fijo + t : fijo;
      const seg = (b0, b1, yy0, yy1, m = mat.pared) => enX ? muro(g, m, b0, b1, y + yy0, y + yy1, c0, c1) : muro(g, m, c0, c1, y + yy0, y + yy1, b0, b1);
      if (!hueco) { seg(a0, a1, 0, H); return; }
      const h0 = hueco.centro - hueco.ancho / 2, h1 = hueco.centro + hueco.ancho / 2;
      seg(a0, h0, 0, H); seg(h1, a1, 0, H);
      seg(h0, h1, hueco.y1, H);
      if (hueco.y0 > 0) seg(h0, h1, 0, hueco.y0);
      // zócalo de color del lado de la galería
      if (hueco.puerta) {
        const ext = lado.endsWith('0') ? -0.02 : 0.02;
        const z0b = enX ? (lado.endsWith('0') ? c0 - .02 : c1) : null;
        if (enX) { caja(g, mat.zocalo, a0, h0, y, y + .9, lado.endsWith('0') ? c0 - .03 : c1, lado.endsWith('0') ? c0 : c1 + .03); caja(g, mat.zocalo, h1, a1, y, y + .9, lado.endsWith('0') ? c0 - .03 : c1, lado.endsWith('0') ? c0 : c1 + .03); }
        else { caja(g, mat.zocalo, lado.endsWith('0') ? c0 - .03 : c1, lado.endsWith('0') ? c0 : c1 + .03, y, y + .9, a0, h0); caja(g, mat.zocalo, lado.endsWith('0') ? c0 - .03 : c1, lado.endsWith('0') ? c0 : c1 + .03, y, y + .9, h1, a1); }
        void ext; void z0b;
      }
    };
    const centroPuerta = (h.ala === 'norte' || h.ala === 'sur') ? h.puerta.x : h.puerta.z;
    for (const lado of ['x0', 'x1', 'z0', 'z1']) {
      if (lado === lados.puerta) pared(lado, { centro: centroPuerta, ancho: 1.1, y0: 0, y1: 2.35, puerta: true });
      else if (lado === lados.ventana) pared(lado, { centro: (lado[0] === 'x' ? (z0 + z1) / 2 : (x0 + x1) / 2), ancho: 1.5, y0: 1.0, y1: 2.3 });
      else pared(lado, null);
    }
    // ventana exterior: vidrio, marco y postigos de color; balcón en el piso 2
    const v = lados.ventana, enX = v[0] === 'z';
    const fijo = { x0, x1, z0, z1 }[v], hacia = v.endsWith('0') ? -1 : 1;
    const cw = enX ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const plano = (a0, a1, yy0, yy1, d0, d1, m) => enX ? muro(g, m, a0, a1, y + yy0, y + yy1, fijo + d0 * hacia < fijo + d1 * hacia ? fijo + d0 * hacia : fijo + d1 * hacia, Math.max(fijo + d0 * hacia, fijo + d1 * hacia))
      : muro(g, m, Math.min(fijo + d0 * hacia, fijo + d1 * hacia), Math.max(fijo + d0 * hacia, fijo + d1 * hacia), y + yy0, y + yy1, a0, a1);
    plano(cw - .75, cw + .75, 1.0, 2.3, -.08, -.06, mat.vidrio);
    plano(cw - .85, cw + .85, 2.3, 2.45, -.02, .06, mColor);
    plano(cw - .85, cw + .85, .9, 1.0, -.02, .08, mColor);
    plano(cw - 1.55, cw - .8, 1.0, 2.3, .0, .05, mColor); // postigos abiertos
    plano(cw + .8, cw + 1.55, 1.0, 2.3, .0, .05, mColor);
    // zócalo exterior de color (característico de Salento)
    if (h.piso === 1) plano(enX ? x0 : z0, enX ? x1 : z1, 0, .85, .0, .04, mColor);
    if (h.piso === 2) { // balcón de madera
      plano(cw - 1.2, cw + 1.2, -.1, .05, 0, .8, mat.madera);
      plano(cw - 1.2, cw + 1.2, .95, 1.05, .76, .82, mColor);
      for (let i = 0; i <= 8; i++) { const a = cw - 1.2 + i * .3; plano(a - .025, a + .025, .05, .95, .77, .81, mColor); }
    }
    // cama y mesa de noche
    const dentro = {
      x: (x0 + x1) / 2 + (lados.ventana === 'x0' ? -1 : lados.ventana === 'x1' ? 1 : 0),
      z: (z0 + z1) / 2 + (lados.ventana === 'z0' ? -1 : lados.ventana === 'z1' ? 1 : 0),
    };
    const ancho = enX ? [1.6, 2.0] : [2.0, 1.6];
    caja(g, mat.madera, dentro.x - ancho[0] / 2, dentro.x + ancho[0] / 2, y, y + .45, dentro.z - ancho[1] / 2, dentro.z + ancho[1] / 2);
    caja(g, mat.blancoCama, dentro.x - ancho[0] / 2 + .05, dentro.x + ancho[0] / 2 - .05, y + .45, y + .62, dentro.z - ancho[1] / 2 + .05, dentro.z + ancho[1] / 2 - .05);
    caja(g, mColor, dentro.x - ancho[0] / 2 + .04, dentro.x + ancho[0] / 2 - .04, y + .5, y + .66, dentro.z - ancho[1] * .1, dentro.z + ancho[1] * .1);

    // puerta (pivote en la bisagra)
    const pivote = new THREE.Group();
    const hoja = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.32, .07), mColor);
    hoja.position.set(.53, 1.16, 0);
    const pomo = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), matColor('#d4af37'));
    pomo.position.set(.92, 1.05, .07);
    const pomo2 = pomo.clone(); pomo2.position.z = -.07;
    const panel1 = new THREE.Mesh(new THREE.BoxGeometry(.7, .8, .09), matColor(new THREE.Color(h.color).multiplyScalar(.75).getStyle()));
    panel1.position.set(.53, 1.65, 0);
    const panel2 = panel1.clone(); panel2.position.y = .65;
    pivote.add(hoja, pomo, pomo2, panel1, panel2);
    // posición y orientación según el ala
    const P = h.puerta;
    if (h.ala === 'norte') { pivote.position.set(P.x - .53, y, P.z - .07); }
    if (h.ala === 'sur') { pivote.position.set(P.x + .53, y, P.z + .07); pivote.rotation.y = Math.PI; }
    if (h.ala === 'oeste') { pivote.position.set(P.x - .07, y, P.z + .53); pivote.rotation.y = Math.PI / 2; }
    if (h.ala === 'este') { pivote.position.set(P.x + .07, y, P.z - .53); pivote.rotation.y = -Math.PI / 2; }
    pivote.userData.giroBase = pivote.rotation.y;
    (recep ? altoDe(g) : g).add(pivote);

    // número de la habitación y farol junto a la puerta
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(.5, .32),
      new THREE.MeshBasicMaterial({ map: textoTextura(h.num, { ancho: 256, alto: 160, fondo: '#f7f1e3', color: '#3b2a1a', borde: h.color, fuente: 'bold 92px Georgia, serif' }) }));
    const farol = new THREE.Mesh(new THREE.BoxGeometry(.18, .26, .18), new THREE.MeshLambertMaterial({ color: '#2b2b2b', emissive: '#ffcc66', emissiveIntensity: .25 }));
    const off = 0.95;
    const sal = (dx, dz) => ({ norte: [dx, -11 + .02 + dz], sur: [-dx, 11 - .02 - dz], oeste: [-15 + .02 + dz, -dx], este: [15 - .02 - dz, dx] })[h.ala];
    const [px, pz] = h.ala === 'norte' || h.ala === 'sur' ? sal(off, 0) : sal(off, 0);
    const base2 = h.ala === 'norte' || h.ala === 'sur' ? { x: P.x + (h.ala === 'norte' ? off : -off), z: pz } : { x: px, z: P.z + (h.ala === 'oeste' ? -off : off) };
    placa.position.set(base2.x, y + 1.6, base2.z);
    placa.rotation.y = { norte: 0, sur: Math.PI, oeste: Math.PI / 2, este: -Math.PI / 2 }[h.ala];
    farol.position.set(base2.x, y + 2.15, base2.z);
    (recep ? altoDe(g) : g).add(placa, farol);

    // volumen de riesgo (solo recepción) y halo de destino (solo huésped)
    const altoVol = recep ? 1.9 : H;
    const vol = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - .3, altoVol, z1 - z0 - .3),
      new THREE.MeshBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: .0, depthWrite: false }));
    vol.position.set((x0 + x1) / 2, y + altoVol / 2 + .03, (z0 + z1) / 2);
    vol.visible = false; vol.userData.num = h.num;
    g.add(vol);

    return { datos: h, grupo: g, pivote, placa, farol, vol, abierta: false, apertura: 0, cama: { x: dentro.x, y: y + .67, z: dentro.z, enX } };
  }

  // --- lobby: fachada, mostrador, letrero
  const fachada = (x0, x1) => muro(piso1, mat.pared, x0, x1, 0, H, 15.86, 16);
  fachada(-10, -1.4); fachada(1.4, 10);
  muro(piso1, mat.pared, -1.4, 1.4, 2.8, H, 15.86, 16);
  caja(piso1, matColor('#7a2e1f'), -1.6, -1.4, 0, 2.9, 15.8, 16.1); caja(piso1, matColor('#7a2e1f'), 1.4, 1.6, 0, 2.9, 15.8, 16.1);
  caja(piso1, matColor('#7a2e1f'), -1.6, 1.6, 2.8, 3.0, 15.8, 16.1);
  for (const x of [-6, 6]) { // ventanales del lobby
    caja(piso1, mat.vidrio, x - 1.6, x + 1.6, .9, 2.6, 15.9, 15.95);
    caja(piso1, matColor('#1f6fb2'), x - 1.75, x + 1.75, 2.6, 2.75, 15.95, 16.1);
    caja(piso1, matColor('#1f6fb2'), x - 1.75, x + 1.75, .0, .85, 15.99, 16.06);
  }
  // piso 2 sobre el lobby: fachada con balcón corrido (mirador)
  muro(piso2, mat.pared, -10, 10, H, 2 * H, 15.86, 16);
  caja(piso2, mat.madera, -8, 8, H - .1, H + .05, 16, 17);
  for (let x = -8; x <= 8; x += .3) caja(piso2, matColor('#b8312f'), x - .025, x + .025, H + .05, H + 1, 16.9, 16.95);
  caja(piso2, matColor('#b8312f'), -8, 8, H + .95, H + 1.05, 16.88, 16.98);
  for (const x of [-6, -2, 2, 6]) muro(piso2, mat.vidrio, x - .7, x + .7, H + .2, H + 2.5, 15.82, 15.86);
  // paredes laterales del lobby y salón
  for (const g of [piso1, piso2]) {
    const y = g === piso1 ? 0 : H;
    muro(g, mat.pared, -10.12, -10, y, y + H, 11, 16);
    muro(g, mat.pared, 10, 10.12, y, y + H, 11, 16);
  }
  // mostrador de recepción
  caja(piso1, mat.madera, 3, 8, 0, 1.1, 13.4, 14.6);
  caja(piso1, mat.maderaClara, 2.9, 8.1, 1.1, 1.18, 13.3, 14.7);
  const campana = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), matColor('#d4af37'));
  campana.position.set(4, 1.18, 13.6); piso1.add(campana);
  // letreros
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({
    map: textoTextura([{ t: 'HOTEL VALLE DE COCORA', fuente: 'bold 70px Georgia, serif' }], { ancho: 1024, alto: 160, fondo: '#2f5d43', color: '#f6e7c1', borde: '#d4af37' }),
  }));
  letrero.position.set(0, 3.25, 16.12); (recep ? alto1 : piso1).add(letrero);
  const senal = (txt, x, y, z, ry, w = 2.6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * .38), new THREE.MeshBasicMaterial({ map: textoTextura(txt, { ancho: 512, alto: 196, fondo: '#2f5d43', color: '#f6e7c1', borde: '#d4af37', fuente: 'bold 50px Georgia, serif' }), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; piso1.add(m); return m;
  };
  senal(['↑ Patio · Hab. 101–119', '← Escalera · Hab. 201–219'], 0, 2.6, 11.15, 0, 3.4);
  senal(['Recepción'], 5.5, 2.4, 13.3, 0, 2);
  const s2 = senal(['Hab. 201–219', '↑ Galería'], -9.2, H + 2.5, 11.2, 0, 2.4); piso1.remove(s2); piso2.add(s2);

  // --- lámparas colgantes de la galería (puntos de luz cálida decorativos)
  const lampMat = new THREE.MeshLambertMaterial({ color: '#3a2a1a', emissive: '#ffbb55', emissiveIntensity: .6 });
  for (const g of [piso1, piso2]) for (const c of columnas()) {
    const lx = c.x + Math.sign(c.x || 1) * 1.5 * (Math.abs(c.x) === 12 ? 1 : 0), lz = c.z + Math.sign(c.z || 1) * 1.5 * (Math.abs(c.z) === 8 ? 1 : 0);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(.13, 0), lampMat);
    m.position.set(lx, (g === piso1 ? 0 : H) + H - .65, lz); g.add(m);
  }

  // --- techos de teja (a dos aguas por ala)
  const tejado = (x0, x1, z0, z1, eje) => {
    const alto = 2.2, yb2 = 2 * H;
    const largo = eje === 'x' ? x1 - x0 : z1 - z0, anchoT = eje === 'x' ? z1 - z0 : x1 - x0;
    const faldon = Math.hypot(anchoT / 2, alto);
    const ang = Math.atan2(alto, anchoT / 2);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(eje === 'x' ? largo : faldon, .12, eje === 'x' ? faldon : largo);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * largo / 2, uv.getY(i) * faldon / 2);
      const m = new THREE.Mesh(geo, mat.teja);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (eje === 'x') { m.position.set(cx, yb2 + alto / 2, cz + s * anchoT / 4); m.rotation.x = s * ang; }
      else { m.position.set(cx + s * anchoT / 4, yb2 + alto / 2, cz); m.rotation.z = -s * ang; }
      techo.add(m);
    }
    // muros piñón (triángulos) en los extremos
  };
  tejado(-20.6, 20.6, -16.8, -7.4, 'x');
  tejado(-20.6, 20.6, 7.4, 16.8, 'x');
  tejado(-20.8, -11.4, -12, 12, 'z');
  tejado(11.4, 20.8, -12, 12, 'z');
  // cielo raso / alero bajo el techo
  caja(techo, mat.madera, -20.6, 20.6, 2 * H - .02, 2 * H + .1, -16.8, -16.2);
  caja(techo, mat.madera, -20.6, 20.6, 2 * H - .02, 2 * H + .1, 16.2, 16.8);
  caja(techo, mat.pared, -20, 20, 2 * H - .1, 2 * H, -16, -8); caja(techo, mat.pared, -20, 20, 2 * H - .1, 2 * H, 8, 16);
  caja(techo, mat.pared, -20, -12, 2 * H - .1, 2 * H, -8, 8); caja(techo, mat.pared, 12, 20, 2 * H - .1, 2 * H, -8, 8);

  // --- paisaje: palmas de cera, montañas, neblina
  const palma = (x, z, alto) => {
    const p = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.18, .32, alto, 7), mat.tronco); tr.position.y = alto / 2; p.add(tr);
    for (let i = 0; i < 9; i++) {
      const hojaG = new THREE.ConeGeometry(.35, 3.6, 4, 1, true); hojaG.translate(0, 1.8, 0);
      const ho = new THREE.Mesh(hojaG, mat.hoja);
      ho.position.y = alto; ho.rotation.y = i * 2 * Math.PI / 9; ho.rotation.z = 1.05 + (i % 3) * .2; ho.rotation.order = 'YZX';
      p.add(ho);
    }
    const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(.6, 0), mat.hoja); copa.position.y = alto + .2; p.add(copa);
    p.position.set(x, 0, z); exterior.add(p);
  };
  for (const p of palmasPlaza()) palma(p.x, p.z, p.h);
  // mobiliario de la plaza: faroles, materas con flores y bancas
  const hierro = matColor('#22262a'), luzFarol = new THREE.MeshLambertMaterial({ color: '#fff3c4', emissive: '#ffcc66', emissiveIntensity: .8 });
  for (const x of [-2.4, 2.4]) {
    caja(exterior, hierro, x - .07, x + .07, 0, 3.2, 17.6 - .07, 17.6 + .07);
    caja(exterior, hierro, x - .22, x + .22, 3.15, 3.25, 17.6 - .22, 17.6 + .22);
    const f = new THREE.Mesh(new THREE.BoxGeometry(.32, .45, .32), luzFarol); f.position.set(x, 2.9, 17.6); exterior.add(f);
  }
  for (const x of [-2.0, 2.0]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.42, .32, .6, 10), matColor('#b5532f')); m.position.set(x, .3, 16.75); exterior.add(m);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 0), matColor('#3c7a35')); b.position.set(x, .95, 16.75); exterior.add(b);
    for (let i = 0; i < 6; i++) {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(.11, 0), matColor(['#e84a6f', '#f2c230', '#ffffff'][i % 3]));
      fl.position.set(x + Math.cos(i) * .4, 1.05 + (i % 2) * .25, 16.75 + Math.sin(i) * .4); exterior.add(fl);
    }
  }
  for (const x of [-6.5, 6.5]) {
    caja(exterior, mat.madera, x - 1, x + 1, .42, .5, 19.6, 20.1);
    caja(exterior, mat.madera, x - 1, x + 1, .55, .95, 20.05, 20.12);
    for (const dx of [-.85, .85]) caja(exterior, hierro, x + dx - .05, x + dx + .05, 0, .45, 19.65, 20.05);
  }
  // nubes
  const nube = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e8eef2', emissiveIntensity: .35, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(), a = i / 14 * Math.PI * 2 + .3, r = 70 + (i % 4) * 25;
    for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + (j % 2) * 3, 0), nube); b.position.set(j * 7 - 10, (j % 2) * 2, (j % 3) * 3); b.scale.y = .55; g.add(b); }
    g.position.set(Math.cos(a) * r, 55 + (i % 3) * 12, Math.sin(a) * r); g.rotation.y = a; exterior.add(g);
  }
  const azar = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < (calidad === 'alta' ? 70 : 34); i++) {
    const a = azar() * Math.PI * 2, r = 45 + azar() * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const alto = 16 + azar() * 16;
    if (z > 20 && Math.abs(x) < 12) continue;
    if (modo === 'recepcion' && z > -10 && r < 100) continue; // no tapar la vista del proyector
    palma(x, z, alto);
  }
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + azar() * .2, r = 175 + azar() * 50, alto = 38 + azar() * 42;
    const geo = new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Mesh(geo, i % 2 ? mat.montana : mat.montana2);
    m.scale.set(48 + azar() * 30, alto, 40 + azar() * 25);
    m.position.set(Math.cos(a) * r, -2, Math.sin(a) * r); m.rotation.y = azar() * 3; exterior.add(m);
  }
  // árboles bajos alrededor del hotel
  for (let i = 0; i < 26; i++) {
    const a = azar() * Math.PI * 2, r = 30 + azar() * 25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 14 && Math.abs(x) < 26) continue;
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + azar() * 1.5, 0), matColor(azar() > .5 ? '#3f7a34' : '#4f8a3c'));
    t.position.set(x, 2.2, z); exterior.add(t);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, 2, 6), mat.madera); tt.position.set(x, 1, z); exterior.add(tt);
  }

  // Fusiona geometrías estáticas por material
  for (const { grupo, material, geos } of lotes.values()) {
    const geo = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    const m = new THREE.Mesh(geo, material); m.matrixAutoUpdate = false; m.updateMatrix();
    grupo.add(m);
  }

  // --- luces y ambiente
  const cielo = new THREE.HemisphereLight('#dfeefa', '#5a6b3a', 1.15); scene.add(cielo);
  const sol = new THREE.DirectionalLight('#fff1d6', 1.6); sol.position.set(-40, 70, 50); scene.add(sol);
  const relleno = new THREE.DirectionalLight('#cfe2ff', .45); relleno.position.set(50, 30, -40); scene.add(relleno);

  // --- API
  function abrirPuerta(num, abrir = true) { const r = habitaciones.get(num); if (r) r.abierta = abrir; }
  function animar(dt) {
    for (const r of habitaciones.values()) {
      const objetivo = r.abierta ? 1 : 0;
      if (r.apertura !== objetivo) {
        r.apertura += Math.sign(objetivo - r.apertura) * Math.min(Math.abs(objetivo - r.apertura), dt * .9);
        const e = r.apertura < .5 ? 2 * r.apertura * r.apertura : 1 - Math.pow(-2 * r.apertura + 2, 2) / 2;
        r.pivote.rotation.y = r.pivote.userData.giroBase + e * 1.75;
      }
    }
  }
  function luzHabitacion(num) {
    const r = habitaciones.get(num); if (!r || r.luz) return;
    const h = r.datos;
    r.luz = new THREE.PointLight('#ffd08a', 0, 9, 1.6);
    r.luz.position.set(h.cx, h.y + 2.6, h.cz); r.grupo.add(r.luz);
  }
  return { L, raiz, piso1, piso2, techo, exterior, altos: [alto1, alto2], habitaciones, abrirPuerta, animar, luzHabitacion, mat };
}

// Cielo con degradado y neblina de montaña
export function ambiente(scene, { neblina = true } = {}) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fb2d9'); gr.addColorStop(.55, '#cfe0e6'); gr.addColorStop(1, '#e9ece4');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  if (neblina) scene.fog = new THREE.Fog('#dfe7e6', 50, 330);
}
