// Celular del huésped: se abre al acercar la tarjeta NFC (index.html?t=1).
// Llave inactiva hasta que recepción la asigna → bienvenida → recorrido en primera persona →
// a más de 30 m: indicaciones generales; a 30 m o menos: el loro orejiamarillo guía hasta la puerta → abrir → check-in.
import * as THREE from './vendor/three.module.js';
import { construirHotel, ambiente, mover, prepararDestino, ruta, OJOS, H, regionEn, crearLayout } from './hotel.js';
import { cargarModelo } from './modelo.js';
import { mapaHabitaciones, HAB_SUGERIDA, nombreAla } from './datos.js';
import { crearSync } from './sync.js';
import { crearLoro } from './loro.js';
import { sonido, desbloquearAudio, vibrar } from './audio.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const T = params.get('t');
const SIM = params.has('sim');
const CLAVE = `cocora-llave-${T}`;
const UMBRAL = 30;

const mostrar = id => { document.querySelectorAll('.pantalla').forEach(p => { p.hidden = p.id !== id; }); };

if (!T) {
  $('#carga-txt').innerHTML = 'Demo del proyecto final de Programación Aplicada: análisis de cancelaciones con un hotel en 3D y llaves NFC.'
    + '<br><br><a class="boton" href="recepcion.html">Abrir la recepción (proyector)</a>'
    + '<a class="boton sec" href="?t=2">Probar una llave de ejemplo</a>'
    + '<br><small>La llave real se abre acercando la tarjeta NFC al celular.</small>';
  document.querySelector('.llave-anim').style.animation = 'none';
  throw new Error('sin tarjeta');
}

const { noche } = await cargarModelo('');

// ---------------------------------------------------------------- modo básico (sin 3D)
// Si el celular no tiene WebGL2, la llave sigue funcionando: bienvenida, abrir la puerta y check-in en el proyector.
const SIN3D = params.has('basico') || !(() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
if (SIN3D) {
  const Lb = crearLayout(), mapaB = mapaHabitaciones(Lb.habitaciones, noche.reservas);
  const syncB = crearSync('huesped');
  let aB = null, hecho = false, ultimo = 0;
  const holaB = () => syncB.enviar('hola', { t: T });
  syncB.alCambiarConexion(ok => { if (ok) holaB(); }); holaB();
  const rep = setInterval(() => { if (!aB) holaB(); }, 2500);
  $('#inactiva-num').textContent = `Llave ${T}`;
  $('#btn-empezar').textContent = '🔑 Abrir mi habitación';
  syncB.on('estado', e => {
    if ((e.actualizado || 0) < ultimo) return; ultimo = e.actualizado || 0;
    const a = e.asignaciones && e.asignaciones[T];
    if (!a) { aB = null; mostrar('p-inactiva'); return; }
    clearInterval(rep);
    hecho = !!(e.checkins && e.checkins[a.hab]);
    if (aB && aB.desde === a.desde) return;
    aB = a;
    const h = Lb.habitaciones.find(x => x.num === a.hab), r = mapaB[a.hab];
    $('#bv-nombre').textContent = `¡Hola, ${a.nombre}!`;
    $('#bv-hab').textContent = a.hab;
    $('#bv-ubic').textContent = `${h.piso}.º piso · ${nombreAla[h.ala]}`;
    $('#bv-tipo').textContent = r ? r.tipo_habitacion : '—';
    $('#bv-noches').textContent = r ? `${r.noches} noche${r.noches > 1 ? 's' : ''}` : '—';
    $('#fin-hab').textContent = a.hab;
    document.querySelector('#p-bienvenida .chico').textContent = 'Tu habitación te espera. Toca el botón para abrirla con tu llave.';
    mostrar(hecho ? 'p-final' : 'p-bienvenida');
  });
  syncB.on('reinicio', () => location.reload());
  $('#btn-empezar').addEventListener('click', () => {
    if (!aB) return;
    desbloquearAudio(); sonido('clic'); setTimeout(() => sonido('exito'), 400);
    let n = 0; const enviar = () => { if (hecho || n++ > 12) return; syncB.enviar('checkin', { t: T, hab: aB.hab }); setTimeout(enviar, 2000); }; enviar();
    mostrar('p-final');
  });
  $('#btn-seguir').hidden = true;
  await new Promise(() => {}); // detiene aquí el módulo: no se carga el 3D
}

// ---------------------------------------------------------------- escena
const lienzo = $('#lienzo');
const movil = matchMedia('(pointer: coarse)').matches || SIM;
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, movil ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
ambiente(scene);
const camara = new THREE.PerspectiveCamera(72, 1, .08, 600);
camara.rotation.order = 'YXZ';
const hotel = construirHotel(scene, { modo: 'huesped', calidad: movil ? 'media' : 'alta' });
const L = hotel.L;
const mapa = mapaHabitaciones(L.habitaciones, noche.reservas);
const loro = crearLoro(); scene.add(loro.grupo);

// Haz de luz y anillo sobre la puerta destino (aparecen a 30 m)
const haz = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 7, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: .0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
const anillo = new THREE.Mesh(new THREE.RingGeometry(.55, .8, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
anillo.rotation.x = -Math.PI / 2;
scene.add(haz, anillo);

// ---------------------------------------------------------------- estado
const yo = { x: 0, y: 0, z: 30, yaw: 0, pitch: -.03 };
let asignacion = null, destino = null, hab = null, habDatos = null;
let checkinHecho = false, puertaAbierta = false, enRecorrido = false;
let modo = 'general', modoPrevio = null, ultimaRuta = null;
const abiertas = [];
const piloto = { activo: params.has('piloto') };
const vuelo = { activo: false, t: 0, desde: null, qDesde: null };
let estadoRecibido = false;

function guardarSesion() {
  try { localStorage.setItem(CLAVE, JSON.stringify({ hab, desde: asignacion && asignacion.desde, pos: { x: yo.x, y: yo.y, z: yo.z, yaw: yo.yaw }, puertaAbierta, t: Date.now() })); } catch (e) { /* nada */ }
}
function leerSesion() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } }

// ---------------------------------------------------------------- sincronización
const sync = crearSync('huesped');
const hola = () => sync.enviar('hola', { t: T });
sync.alCambiarConexion(ok => { if (ok) hola(); });
hola();
const insistir = setInterval(() => { if (!estadoRecibido) hola(); }, 2500);
setTimeout(() => { if (!estadoRecibido) { $('#carga-txt').textContent = 'Conectando con recepción…'; mostrar('p-inactiva'); $('#btn-demo').hidden = false; } }, 7000);
$('#inactiva-num').textContent = `Llave ${T}`;

let ultimoActualizado = 0;
sync.on('estado', (e) => {
  // con varias pantallas de recepción abiertas, solo cuenta el estado más reciente
  if ((e.actualizado || 0) < ultimoActualizado) return;
  ultimoActualizado = e.actualizado || 0;
  estadoRecibido = true;
  clearInterval(insistir);
  $('#btn-demo').hidden = true;
  const a = e.asignaciones && e.asignaciones[T];
  if (!a) {
    if (asignacion) { asignacion = null; enRecorrido = false; $('#hud').hidden = true; }
    mostrar('p-inactiva');
    return;
  }
  const nueva = !asignacion || asignacion.hab !== a.hab || asignacion.desde !== a.desde;
  asignacion = a;
  if (nueva) checkinHecho = false;
  if (e.checkins && e.checkins[a.hab]) { checkinHecho = true; }
  if (nueva) prepararLlave(a);
});
sync.on('reinicio', () => { try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } location.reload(); });

$('#btn-demo').addEventListener('click', () => { estadoRecibido = true; prepararLlave({ hab: HAB_SUGERIDA, nombre: 'Huésped', desde: 0, demo: true }); });

function prepararLlave(a) {
  // si cambia de habitación, la puerta anterior vuelve a su estado normal
  if (hab && hab !== a.hab) { const prev = hotel.habitaciones.get(hab); if (prev) prev.farol.material.emissiveIntensity = .25; }
  puertaAbierta = false;
  hab = a.hab;
  habDatos = L.habitaciones.find(h => h.num === hab);
  destino = prepararDestino(L, hab);
  const r = mapa[hab];
  $('#bv-nombre').textContent = `¡Hola, ${a.nombre}!`;
  $('#bv-hab').textContent = hab;
  $('#bv-ubic').textContent = `${habDatos.piso}.º piso · ${nombreAla[habDatos.ala]}`;
  $('#bv-tipo').textContent = r ? `${r.tipo_habitacion}${r.incluye_desayuno ? ' · con desayuno' : ''}` : '—';
  $('#bv-noches').textContent = r ? `${r.noches} noche${r.noches > 1 ? 's' : ''} · ${r.adultos + r.ninos} huésped${r.adultos + r.ninos > 1 ? 'es' : ''}` : '—';
  $('#guia-titulo').textContent = `Habitación ${hab} · ${habDatos.piso}.º piso, ${nombreAla[habDatos.ala]}`;
  $('#fin-hab').textContent = hab;
  const rh = hotel.habitaciones.get(hab);
  if (!rh.farol.userData.propio) { rh.farol.material = rh.farol.material.clone(); rh.farol.userData.propio = true; }
  ponerNota(a.nombre);

  // ¿Vuelve a acercar la tarjeta? Retoma el recorrido donde iba (y abre la puerta si está frente a ella)
  const s = leerSesion();
  if (s && s.hab === hab && s.desde === a.desde && Date.now() - s.t < 3 * 3600e3 && s.pos) {
    Object.assign(yo, { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.pos.yaw });
    puertaAbierta = !!s.puertaAbierta || checkinHecho;
    if (puertaAbierta) abrirPuerta(true);
    empezar(true);
    const d = Math.hypot(yo.x - habDatos.puerta.x, yo.z - habDatos.puerta.z);
    if (!puertaAbierta && d < 3.2 && Math.abs(yo.y - habDatos.y) < 1) {
      avisar('🔑 Tu llave abrió la puerta');
      setTimeout(() => abrirPuerta(), 600);
    } else avisar('Continúa tu recorrido');
    return;
  }
  if (checkinHecho) { puertaAbierta = true; abrirPuerta(true); }
  mostrar('p-bienvenida');
  sonido('ping');
}

$('#btn-empezar').addEventListener('click', () => { desbloquearAudio(); empezar(false); });
$('#btn-seguir').addEventListener('click', () => { mostrar(null); avisar('🌺 Entra: hay una nota para ti en la cama'); });

function empezar(retomar) {
  if (!hab) return;
  mostrar(null);
  $('#hud').hidden = false;
  enRecorrido = true;
  if (!retomar) Object.assign(yo, { x: 0, y: 0, z: 33.5, yaw: 0, pitch: .04 });
  vuelo.t = 0; vuelo.activo = !retomar; vuelo.desde = camara.position.clone(); vuelo.qDesde = camara.quaternion.clone();
  setTimeout(() => { $('#ayuda').style.opacity = 0; }, 6000);
}

// ---------------------------------------------------------------- controles (táctil + teclado + mouse)
const joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
const mirar = { id: null, x: 0, y: 0 };
const radio = 55;
const zonaJoy = $('#joystick');
function ponerPerilla() { $('#perilla').style.transform = `translate(${joy.x * radio}px, ${joy.y * radio}px)`; }
lienzo.addEventListener('pointerdown', e => {
  const r = zonaJoy.getBoundingClientRect();
  const enJoy = e.pointerType !== 'mouse' && e.clientX < innerWidth * .45 && e.clientY > innerHeight * .45;
  const sobreJoy = e.clientX > r.left - 30 && e.clientX < r.right + 30 && e.clientY > r.top - 30 && e.clientY < r.bottom + 30;
  if ((enJoy || sobreJoy) && joy.id === null) {
    joy.id = e.pointerId; joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; moverJoy(e);
    if (piloto.activo) { piloto.activo = false; actualizarLlevame(); }
  } else if (mirar.id === null) { mirar.id = e.pointerId; mirar.x = e.clientX; mirar.y = e.clientY; }
  lienzo.setPointerCapture(e.pointerId);
});
$('#btn-llevame').addEventListener('click', () => { piloto.activo = !piloto.activo; actualizarLlevame(); desbloquearAudio(); });
function actualizarLlevame() { $('#btn-llevame').setAttribute('aria-pressed', piloto.activo); $('#btn-llevame').textContent = piloto.activo ? '⏸ Caminando solo…' : '🚶 Llévame'; }
function moverJoy(e) {
  let dx = (e.clientX - joy.cx) / radio, dy = (e.clientY - joy.cy) / radio;
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  joy.x = dx; joy.y = dy; ponerPerilla();
}
lienzo.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) moverJoy(e);
  else if (e.pointerId === mirar.id) {
    const k = e.pointerType === 'mouse' ? .0042 : .0058;
    yo.yaw -= (e.clientX - mirar.x) * k; yo.pitch -= (e.clientY - mirar.y) * k * .8;
    yo.pitch = THREE.MathUtils.clamp(yo.pitch, -1.1, 1.0);
    mirar.x = e.clientX; mirar.y = e.clientY;
  }
});
const soltar = e => {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; ponerPerilla(); }
  if (e.pointerId === mirar.id) mirar.id = null;
};
lienzo.addEventListener('pointerup', soltar); lienzo.addEventListener('pointercancel', soltar);
const teclas = new Set();
addEventListener('keydown', e => teclas.add(e.key.toLowerCase()));
addEventListener('keyup', e => teclas.delete(e.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

// Nota de bienvenida personalizada sobre la cama, con pétalos
let nota = null;
function ponerNota(nombre) {
  const r = hotel.habitaciones.get(hab); if (!r) return;
  if (nota) { nota.parent.remove(nota); nota = null; }
  const c = document.createElement('canvas'); c.width = 512; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, 512, 360);
  g.strokeStyle = '#d9b45a'; g.lineWidth = 10; g.strokeRect(14, 14, 484, 332);
  g.fillStyle = '#2f5d43'; g.textAlign = 'center';
  g.font = 'italic 34px Georgia, serif'; g.fillText('Hola,', 256, 105);
  g.font = 'bold 46px Georgia, serif'; g.fillText(nombre.slice(0, 18), 256, 170);
  g.font = '26px Georgia, serif'; g.fillStyle = '#6b5a3a'; g.fillText('Te damos la bienvenida a Cocora', 256, 235);
  g.font = 'bold 22px Georgia, serif'; g.fillStyle = '#b8312f'; g.fillText('HOTEL VALLE DE COCORA · HAB. ' + hab, 256, 300);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  nota = new THREE.Group();
  const papel = new THREE.Mesh(new THREE.PlaneGeometry(.95, .67), new THREE.MeshBasicMaterial({ map: t }));
  papel.rotation.x = -Math.PI / 2;
  nota.add(papel);
  const petalo = new THREE.MeshLambertMaterial({ color: '#c62f4a' });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), petalo);
    p.scale.y = .3; p.position.set(Math.cos(i * 2.4) * (.6 + (i % 3) * .06), 0, Math.sin(i * 2.4) * (.42 + (i % 2) * .05)); nota.add(p);
  }
  const hacia = { norte: [0, 1], sur: [0, -1], oeste: [1, 0], este: [-1, 0] }[habDatos.ala];
  nota.position.set(r.cama.x + hacia[0] * .35, r.cama.y + .01, r.cama.z + hacia[1] * .35);
  // que el texto quede de frente a quien entra por la puerta
  nota.rotation.y = { norte: 0, sur: Math.PI, oeste: Math.PI / 2, este: -Math.PI / 2 }[habDatos.ala];
  r.grupo.add(nota);
}

// ---------------------------------------------------------------- puerta y check-in
$('#btn-abrir').addEventListener('click', () => abrirPuerta());
function abrirPuerta(silencioso = false) {
  if (!hab) return;
  puertaAbierta = true;
  hotel.abrirPuerta(hab, true);
  hotel.luzHabitacion(hab);
  if (!abiertas.includes(hab)) abiertas.push(hab);
  $('#hoja-puerta').hidden = true;
  guardarSesion();
  if (silencioso) return;
  sonido('clic'); vibrar([30, 60, 120]);
  setTimeout(() => sonido('exito'), 450);
  enviarCheckin();
  setTimeout(() => { mostrar('p-final'); confeti(); }, 1600);
  setTimeout(() => avisar('🌺 Entra: hay una nota para ti en la cama'), 1200);
}
function enviarCheckin() {
  if (!asignacion || asignacion.demo) return;
  let intentos = 0;
  const enviar = () => {
    if (checkinHecho || intentos++ > 12) return;
    sync.enviar('checkin', { t: T, hab });
    setTimeout(enviar, 2000);
  };
  enviar();
}
sync.on('estado', e => { if (hab && e.checkins && e.checkins[hab]) checkinHecho = true; });

// ---------------------------------------------------------------- guía
const nombrePiso = p => p === 1 ? '1.er piso' : '2.º piso';
function zonaDe(p) {
  const r = regionEn(L, p.x, p.z, p.y, abiertas);
  return r ? r.nombre : 'galeria';
}
function instruccion(zona) {
  const piso = yo.y > H / 2 ? 2 : 1;
  const ala = nombreAla[habDatos.ala];
  if (zona === 'plaza' || zona === 'puerta') return 'Entra al hotel por la puerta principal';
  if (zona === 'escalera') return habDatos.piso === 2 ? 'Sube la escalera hasta el 2.º piso' : 'Baja la escalera al 1.er piso';
  if (zona === 'hab' || zona === 'umbral') return 'Estás en tu habitación';
  if (habDatos.piso !== piso) {
    if (habDatos.piso === 2) return zona === 'lobby' ? 'Sube por la escalera del lobby, junto a la entrada' : 'Vuelve al lobby y sube por la escalera';
    return zona === 'salon' ? 'Baja por la escalera del salón' : 'Ve al salón sobre el lobby y baja la escalera';
  }
  if (zona === 'lobby') return `Cruza hacia el patio y sigue al ${ala}`;
  if (zona === 'salon') return `Sal a la galería y sigue hacia el ${ala}`;
  if (zona === 'patio') return `Sal del patio hacia la galería del ${ala}`;
  return `Sigue por la galería hacia el ${ala}`;
}

let acumGuia = 0, acumPos = 0, ultimoEnvio = null, acumChirrido = 0;
function actualizarGuia(dt) {
  if (!destino || !habDatos) return;
  acumGuia += dt; if (acumGuia < .12) return; acumGuia = 0;
  const rr = ruta(L, destino, { x: yo.x, y: yo.y, z: yo.z }, abiertas);
  if (rr) ultimaRuta = rr;
  const r = ultimaRuta; if (!r) return;
  const zona = zonaDe(yo);
  const dentro = zona === 'hab' && Math.abs(yo.y - habDatos.y) < 1;
  const d = dentro ? 0 : r.distancia;
  modo = dentro ? 'adentro' : (d <= 3.0 && !puertaAbierta) ? 'puerta' : d <= UMBRAL ? 'cerca' : 'general';
  if (puertaAbierta && d < 2.4) modo = 'adentro';

  if (modo !== modoPrevio) {
    if (modo === 'cerca' && modoPrevio === 'general') { sonido('loro'); vibrar([70, 50, 70]); avisar('🦜 ¡Sigue al loro orejiamarillo!'); aparecerLoro(); }
    if (modo === 'puerta') vibrar(40);
    if (modo === 'cerca' && !loro.grupo.visible) aparecerLoro();
    if (modo === 'general') loro.grupo.visible = false;
    $('#guia').classList.toggle('cerca', modo !== 'general');
    modoPrevio = modo;
  }
  $('#hoja-puerta').hidden = !(modo === 'puerta');
  if (modo === 'puerta') $('#ayuda').style.opacity = 0;
  $('#btn-llevame').hidden = modo === 'puerta' || modo === 'adentro';
  if ((modo === 'puerta' || modo === 'adentro') && piloto.activo) { piloto.activo = false; actualizarLlevame(); }
  $('#hp-titulo').textContent = `Estás frente a la ${hab}`;
  $('#guia-dist').textContent = Math.max(0, Math.round(d));
  let texto;
  if (modo === 'general') texto = instruccion(zona);
  else if (modo === 'cerca') texto = 'El loro te lleva a tu puerta';
  else if (modo === 'puerta') texto = 'Esta es tu puerta';
  else texto = puertaAbierta ? '¡Llegaste a tu habitación!' : 'Estás en tu habitación';
  $('#guia-texto').textContent = texto;

  // flecha: hacia el siguiente punto del camino (o la puerta)
  const sig = r.puntos.find((p, i) => i > 0 && Math.hypot(p.x - yo.x, p.z - yo.z) > 1.2) || r.puntos[r.puntos.length - 1];
  const rumbo = Math.atan2(-(sig.x - yo.x), -(sig.z - yo.z));
  let rel = rumbo - yo.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  $('#flecha').style.transform = `rotate(${-rel}rad)`;
  $('#flecha').style.opacity = modo === 'adentro' ? .25 : 1;
  dibujarMinimapa(r);
}

function avisar(txt) {
  const a = $('#aviso'); a.textContent = txt; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => { a.hidden = true; }, 3800);
}

// ---------------------------------------------------------------- loro
const loroPos = new THREE.Vector3();
function aparecerLoro() {
  const f = new THREE.Vector3(-Math.sin(yo.yaw), 0, -Math.cos(yo.yaw));
  loroPos.set(yo.x + f.x * 7, yo.y + OJOS + 3, yo.z + f.z * 7);
  loro.grupo.position.copy(loroPos);
  loro.grupo.visible = true;
}
function puntoEnRuta(r, s) {
  let resto = s;
  for (let i = 0; i < r.puntos.length - 1; i++) {
    const a = r.puntos[i], b = r.puntos[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (resto <= l) { const t = l ? resto / l : 0; return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    resto -= l;
  }
  const u = r.puntos[r.puntos.length - 1]; return new THREE.Vector3(u.x, u.y, u.z);
}
function animarLoro(dt, t) {
  if (!loro.grupo.visible || !ultimaRuta) return;
  const h = habDatos;
  const posado = modo === 'puerta' || modo === 'adentro' || ultimaRuta.distancia < 4.2;
  let obj;
  if (posado) {
    // sobre el marco de la puerta, un poco hacia la galería
    const n = { norte: [0, 1], sur: [0, -1], oeste: [1, 0], este: [-1, 0] }[h.ala];
    obj = new THREE.Vector3(h.puerta.x + n[0] * .35, h.y + 2.62, h.puerta.z + n[1] * .35);
  } else {
    obj = puntoEnRuta(ultimaRuta, Math.min(5.2, ultimaRuta.distancia - .5));
    obj.y += OJOS + .75 + Math.sin(t * 2.2) * .2;
    // un poco a la derecha del camino para no tapar la vista
    obj.x += Math.cos(yo.yaw) * .55; obj.z -= Math.sin(yo.yaw) * .55;
  }
  const antes = loro.grupo.position.clone();
  loro.grupo.position.lerp(obj, 1 - Math.exp(-dt * (posado ? 3 : 2.6)));
  const v = loro.grupo.position.clone().sub(antes);
  if (!posado && v.lengthSq() > 1e-6) loro.grupo.rotation.y = Math.atan2(-v.x, -v.z);
  if (posado) { const a = Math.atan2(-(yo.x - h.puerta.x), -(yo.z - h.puerta.z)); loro.grupo.rotation.y += (a - loro.grupo.rotation.y) * .1; }
  loro.grupo.rotation.z = posado ? 0 : THREE.MathUtils.clamp(-v.x * 3, -.4, .4) * 0;
  loro.animar(dt, { posado });
  acumChirrido += dt;
  if (acumChirrido > 7 && modo === 'cerca') { acumChirrido = 0; sonido('loro'); }
}

// ---------------------------------------------------------------- minimapa
const mm = $('#minimapa'), g2 = mm.getContext('2d');
function dibujarMinimapa(r) {
  const W = mm.width, E = W / 56, cx = W / 2, cz = W * .42;
  const P = (x, z) => [cx + x * E, cz + (z - 6) * E];
  g2.clearRect(0, 0, W, W);
  const piso = yo.y > H / 2 ? 2 : 1;
  g2.fillStyle = '#ffffff10'; g2.fillRect(...P(-20, -16), 40 * E, 32 * E);
  for (const h of L.habitaciones.filter(h => h.piso === piso)) {
    const [x, y] = P(h.x0, h.z0);
    g2.fillStyle = h.num === hab ? '#ffd23f' : '#f6efe130';
    g2.fillRect(x + 1, y + 1, (h.x1 - h.x0) * E - 2, (h.z1 - h.z0) * E - 2);
  }
  if (piso === 1) { g2.fillStyle = '#5d8a3a88'; g2.fillRect(...P(-12, -8), 24 * E, 16 * E); }
  // camino
  g2.strokeStyle = '#ffd23f'; g2.lineWidth = 3; g2.setLineDash([5, 4]); g2.beginPath();
  r.puntos.forEach((p, i) => { const [x, y] = P(p.x, p.z); i ? g2.lineTo(x, y) : g2.moveTo(x, y); }); g2.stroke(); g2.setLineDash([]);
  // yo
  const [px, py] = P(yo.x, yo.z);
  g2.fillStyle = '#fff'; g2.beginPath();
  g2.moveTo(px - Math.sin(yo.yaw) * 9, py - Math.cos(yo.yaw) * 9);
  g2.lineTo(px - Math.sin(yo.yaw + 2.5) * 6, py - Math.cos(yo.yaw + 2.5) * 6);
  g2.lineTo(px - Math.sin(yo.yaw - 2.5) * 6, py - Math.cos(yo.yaw - 2.5) * 6); g2.fill();
  g2.fillStyle = '#f6efe1'; g2.font = 'bold 20px Inter, sans-serif'; g2.textAlign = 'left';
  g2.fillText(piso === 1 ? '1.er piso' : '2.º piso', 10, W - 12);
  if (habDatos.piso !== piso) { g2.fillStyle = '#ffd23f'; g2.textAlign = 'right'; g2.fillText(habDatos.piso === 2 ? '↑ sube' : '↓ baja', W - 10, W - 12); }
}

// ---------------------------------------------------------------- confeti
function confeti() {
  const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:30;pointer-events:none';
  c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  const g = c.getContext('2d'), col = ['#ffd23f', '#2f9e44', '#e5483b', '#1f6fb2', '#f6efe1'];
  const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, c: col[Math.random() * 5 | 0], a: Math.random() * 6 }));
  let n = 0;
  (function f() {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.a += .1; g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-4, -2, 8, 4); g.restore(); });
    if (n++ < 220) requestAnimationFrame(f); else c.remove();
  })();
}

// ---------------------------------------------------------------- bucle
const reloj = new THREE.Clock();
let tiempo = 0, paso = 0;
function redimensionar() {
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.fov = camara.aspect < 1 ? 78 : 68;
  camara.updateProjectionMatrix();
}
addEventListener('resize', redimensionar); redimensionar();

// Rendimiento adaptativo: si el celular va lento, baja la resolución interna
const rend = { suma: 0, n: 0, nivel: 0 };
function vigilarRendimiento(dt) {
  if (document.hidden || dt <= 0) return;
  rend.suma += dt; rend.n++;
  if (rend.n < 90) return;
  const fps = rend.n / rend.suma; rend.suma = 0; rend.n = 0;
  if (fps < 26 && rend.nivel < 2) {
    rend.nivel++;
    renderer.setPixelRatio(rend.nivel === 1 ? 1 : .75);
    redimensionar();
  }
}
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  avisar('El celular pausó el 3D: recarga la página');
});
let acumAve = 0;
function cuadro() {
  const dtReal = reloj.getDelta();
  vigilarRendimiento(dtReal);
  if (enRecorrido) { acumAve += dtReal; if (acumAve > 9 + Math.random() * 8) { acumAve = 0; if (modo === 'general') sonido('pajaro'); } }
  avanzar(Math.min(dtReal, .05));
  if (document.hidden) setTimeout(cuadro, 100); else requestAnimationFrame(cuadro);
}
function avanzar(dt) {
  tiempo += dt; const t = tiempo;
  if (enRecorrido) {
    // movimiento
    let fx = -joy.y, sx = joy.x;
    if (piloto.activo && ultimaRuta && modo !== 'adentro') {
      const sig = ultimaRuta.puntos.find((p, i) => i > 0 && Math.hypot(p.x - yo.x, p.z - yo.z) > .6) || ultimaRuta.puntos[ultimaRuta.puntos.length - 1];
      const rumbo = Math.atan2(-(sig.x - yo.x), -(sig.z - yo.z));
      let d = rumbo - yo.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      yo.yaw += d * Math.min(1, dt * 4); yo.pitch *= .95;
      fx = Math.abs(d) < 1.2 && ultimaRuta.distancia > 2.2 ? 1 : 0;
    }
    if (teclas.has('w') || teclas.has('arrowup')) fx += 1;
    if (teclas.has('s') || teclas.has('arrowdown')) fx -= 1;
    if (teclas.has('a')) sx -= 1; if (teclas.has('d')) sx += 1;
    if (teclas.has('arrowleft')) yo.yaw += dt * 1.8; if (teclas.has('arrowright')) yo.yaw -= dt * 1.8;
    const m = Math.min(1, Math.hypot(fx, sx));
    if (m > .05) {
      const vel = 3.4 * (teclas.has('shift') ? 1.8 : 1);
      const n = Math.hypot(fx, sx);
      const fxn = fx / n * m, sxn = sx / n * m;
      const dx = (-Math.sin(yo.yaw) * fxn + Math.cos(yo.yaw) * sxn) * vel * dt;
      const dz = (-Math.cos(yo.yaw) * fxn - Math.sin(yo.yaw) * sxn) * vel * dt;
      mover(L, yo, dx, dz, abiertas);
      paso += dt * m * 9;
    }
    // frente a la puerta: girar suavemente la mirada hacia ella (si no está mirando con el dedo)
    if (modo === 'puerta' && habDatos && mirar.id === null && m < .05) {
      const rumbo = Math.atan2(-(habDatos.puerta.x - yo.x), -(habDatos.puerta.z - yo.z));
      let d = rumbo - yo.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      yo.yaw += d * Math.min(1, dt * 2.5); yo.pitch += (.12 - yo.pitch) * Math.min(1, dt * 2.5);
    }
    camara.position.set(yo.x, yo.y + OJOS + Math.sin(paso) * .035, yo.z);
    camara.rotation.set(yo.pitch, yo.yaw, 0);
    // vuelo de entrada: de la vista aérea a los ojos del huésped
    if (vuelo.activo) {
      vuelo.t += dt / 2.2;
      const k = Math.min(1, vuelo.t), e = 1 - Math.pow(1 - k, 3);
      const qFin = camara.quaternion.clone();
      camara.position.lerpVectors(vuelo.desde, camara.position.clone(), e);
      camara.quaternion.slerpQuaternions(vuelo.qDesde, qFin, e);
      if (k >= 1) vuelo.activo = false;
    }
    actualizarGuia(dt);
    animarLoro(dt, t);
    // haz de luz sobre la puerta cuando está cerca
    if (habDatos) {
      const objetivo = (modo === 'cerca' || modo === 'puerta') ? 1 : 0;
      const n = { norte: [0, 1], sur: [0, -1], oeste: [1, 0], este: [-1, 0] }[habDatos.ala];
      haz.position.set(habDatos.puerta.x + n[0] * .9, habDatos.y + 3.5, habDatos.puerta.z + n[1] * .9);
      anillo.position.set(habDatos.puerta.x + n[0] * .9, habDatos.y + .04, habDatos.puerta.z + n[1] * .9);
      haz.material.opacity += (objetivo * (.16 + .06 * Math.sin(t * 3)) - haz.material.opacity) * .1;
      anillo.material.opacity += (objetivo * .85 - anillo.material.opacity) * .1;
      anillo.scale.setScalar(1 + .15 * Math.sin(t * 4));
      const f = hotel.habitaciones.get(hab).farol.material; f.emissiveIntensity = objetivo ? 1.4 + Math.sin(t * 6) * .5 : .25;
      const r = hotel.habitaciones.get(hab);
      if (r.luz) r.luz.intensity += (14 - r.luz.intensity) * .03;
    }
    // reportar posición a recepción (4 por segundo)
    acumPos += dt;
    if (acumPos > .25 && asignacion && !asignacion.demo) {
      acumPos = 0;
      const p = { t: T, x: +yo.x.toFixed(2), y: +yo.y.toFixed(2), z: +yo.z.toFixed(2), yaw: +yo.yaw.toFixed(2), dist: ultimaRuta ? +ultimaRuta.distancia.toFixed(1) : null, modo };
      const clave = JSON.stringify(p);
      if (clave !== ultimoEnvio || Math.random() < .15) { sync.enviar('pos', p); ultimoEnvio = clave; }
    }
    if (Math.random() < .02) guardarSesion();
  } else {
    // fondo animado mientras se muestran las pantallas: vista aérea girando
    const a = t * .08;
    camara.position.set(Math.sin(a) * 58, 30, Math.cos(a) * 58);
    camara.lookAt(0, 3, 0);
  }
  hotel.animar(dt);
  renderer.render(scene, camara);
}
cuadro();
window.demo = { renderer, camara, piloto, yo, hotel, L, sync, get modo() { return modo; }, avanzar: (s = 1) => { for (let i = 0; i < s * 30; i++) avanzar(1 / 30); }, abrirPuerta };
