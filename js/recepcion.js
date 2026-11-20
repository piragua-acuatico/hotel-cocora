// Pantalla de recepción (proyector): hotel 3D con el semáforo de riesgo, llaves NFC, avatar del huésped en vivo
// y las tres decisiones de la gerencia (P1 sobreventa, P2 depósito, P3 política por canal).
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { construirHotel, ambiente, H, prepararDestino, ruta } from './hotel.js';
import { cargarModelo, probabilidad, nivel, factores, dinero, sobreventa, distribucionLlegadas } from './modelo.js';
import { mapaHabitaciones, HAB_SUGERIDA, nombreAla } from './datos.js';
import { crearSync } from './sync.js';
import { COLORES, TARJETAS, URL_PUBLICA } from './config.js';
import { sonido } from './audio.js';

const $ = s => document.querySelector(s);
const SEPARA = 46; // en la vista de ocupación el piso 2 se pone al lado del piso 1, como dos planos de maqueta
const desp = (y) => y > H / 2 ? { x: SEPARA * elev.actual, y: -(H - .03) * elev.actual } : { x: 0, y: 0 };
const CLAVE = 'cocora-recepcion-v1';

const { modelo, noche, cifras } = await cargarModelo('');

// ---------------------------------------------------------------- estado
const inicial = () => ({ asignaciones: {}, checkins: {}, deposito: false, politica: false, extra: 0, revelar: false, v: 0, actualizado: 0 });
let estado = inicial();
try { Object.assign(estado, JSON.parse(localStorage.getItem(CLAVE)) || {}); } catch (e) { /* nada */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* nada */ } };
const vivos = {}; // por tarjeta: última posición reportada por el celular

// ---------------------------------------------------------------- escena
const lienzo = $('#lienzo');
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
ambiente(scene, { neblina: true });
scene.fog.near = 120; scene.fog.far = 420;
const camara = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
camara.position.set(SEPARA / 2, 60, 40);
const controles = new OrbitControls(camara, lienzo);
controles.target.set(SEPARA / 2, 0, 2);
controles.enableDamping = true; controles.maxPolarAngle = Math.PI * .47; controles.minDistance = 18; controles.maxDistance = 170;

renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const hotel = construirHotel(scene, { modo: 'recepcion', calidad: 'alta', sombras: true });
const L = hotel.L;
const mapa = mapaHabitaciones(L.habitaciones, noche.reservas);

// Avatar del huésped
function crearAvatar() {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(.38, .9, 4, 10), new THREE.MeshLambertMaterial({ color: '#d9b45a', emissive: '#5a4310' }));
  cuerpo.position.y = .85;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), new THREE.MeshLambertMaterial({ color: '#f1d6b8' }));
  cabeza.position.y = 1.75;
  const anillo = new THREE.Mesh(new THREE.RingGeometry(.7, 1.0, 32), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: .8, side: THREE.DoubleSide }));
  anillo.rotation.x = -Math.PI / 2; anillo.position.y = .05;
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(.12, .35, 8), new THREE.MeshLambertMaterial({ color: '#0f5b32' }));
  nariz.rotation.x = Math.PI / 2; nariz.position.set(0, 1.75, -.36);
  g.add(cuerpo, cabeza, anillo, nariz); g.scale.setScalar(1.4); g.visible = false;
  g.userData.anillo = anillo;
  scene.add(g); return g;
}
const avatares = Object.fromEntries(TARJETAS.map(t => [t, crearAvatar()]));
// Ruta del huésped: "migas" luminosas que fluyen hacia su puerta
const MAX_MIGAS = 160;
const COLOR_RUTA = { '1': '#ffe08a', '2': '#8fd3ff' };
const rutas = Object.fromEntries(TARJETAS.map(t => {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(.26, 10, 8), new THREE.MeshBasicMaterial({ color: COLOR_RUTA[t] || '#ffe08a', depthTest: false, transparent: true, opacity: .95 }), MAX_MIGAS);
  m.renderOrder = 10; m.visible = false; m.count = 0; m.frustumCulled = false; scene.add(m);
  return [t, { mesh: m, puntos: [] }];
}));
const mAux = new THREE.Matrix4();
function dibujarMigas(t) {
  for (const r of Object.values(rutas)) {
    const malla = r.mesh, cruda = r.puntos;
    if (!malla.visible || cruda.length < 2) continue;
    let n = 0; const paso = .9, fase = (t * 1.6) % paso;
    for (let i = 0; i < cruda.length - 1 && n < MAX_MIGAS; i++) {
      const a = cruda[i], b = cruda[i + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      for (let s = (i === 0 ? fase : 0); s < l && n < MAX_MIGAS; s += paso) {
        const k = s / l, x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
        const d = desp(y);
        mAux.makeTranslation(x + d.x, y + .3 + d.y, z); malla.setMatrixAt(n++, mAux);
      }
    }
    malla.count = n; malla.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- probabilidades y escenarios
function reservaEscenario(r) {
  const e = { ...r };
  if (estado.deposito && r.p > modelo.umbral_alto && !r.deposito_pagado) e.deposito_pagado = 1;
  if (estado.politica && (r.canal === 'Booking' || r.canal === 'Airbnb') && r.politica_cancelacion === 'Flexible') e.politica_cancelacion = 'Moderada';
  return e;
}
function pAhora(num) { return probabilidad(reservaEscenario(mapa[num])); }
function colorDe(num) {
  if (estado.checkins[num]) return COLORES.checkin;
  return COLORES[nivel(pAhora(num))];
}
const fmtPct = p => (p * 100).toLocaleString('es-CO', { maximumFractionDigits: p < .1 ? 1 : 0 }) + ' %';
const fmt1 = n => n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------------------------------------------------------------- etiquetas HTML
const capa = $('#etiquetas');
const etiquetas = new Map();
for (const h of L.habitaciones) {
  const d = document.createElement('div'); d.className = 'etq'; d.dataset.num = h.num;
  d.addEventListener('click', () => seleccionar(h.num));
  capa.appendChild(d); etiquetas.set(h.num, d);
}
const rotulos = ['Piso 1', 'Piso 2'].map(t => { const d = document.createElement('div'); d.className = 'rotulo'; d.textContent = t; capa.appendChild(d); return d; });
const etqAvatar = Object.fromEntries(TARJETAS.map(t => { const d = document.createElement('div'); d.className = 'etq huesped'; d.style.display = 'none'; capa.appendChild(d); return [t, d]; }));

let seleccion = null;
function pintar() {
  for (const h of L.habitaciones) {
    const r = hotel.habitaciones.get(h.num);
    const c = colorDe(h.num);
    r.vol.material.color.set(c);
    const d = etiquetas.get(h.num);
    const p = pAhora(h.num);
    d.style.setProperty('--c', c);
    d.classList.toggle('oscuro', !!estado.checkins[h.num]);
    d.innerHTML = estado.checkins[h.num] ? `${h.num}<small>✓ adentro</small>` : `${h.num}<small>${fmtPct(p)}</small>`;
    d.classList.toggle('sel', seleccion === h.num);
    d.classList.toggle('cancelo', estado.revelar && !!mapa[h.num].cancelada);
    d.classList.toggle('vino', estado.revelar && !mapa[h.num].cancelada);
    if (estado.checkins[h.num]) hotel.abrirPuerta(h.num, true);
  }
  actualizarKPIs(); actualizarDecisiones(); dibujarTarjetas();
  if (seleccion) mostrarDetalle(seleccion);
}

// ---------------------------------------------------------------- KPIs y decisiones
function probsNoche() { return L.habitaciones.map(h => estado.checkins[h.num] ? 0 : pAhora(h.num)); }
function actualizarKPIs() {
  const ps = probsNoche();
  const esperadas = ps.reduce((a, b) => a + b, 0);
  const enRiesgo = L.habitaciones.reduce((s, h) => s + (estado.checkins[h.num] ? 0 : pAhora(h.num) * mapa[h.num].tarifa_noche * mapa[h.num].noches), 0);
  const altos = L.habitaciones.filter(h => !estado.checkins[h.num] && nivel(pAhora(h.num)) === 'alto').length;
  const adentro = Object.keys(estado.checkins).length;
  $('#kpis').innerHTML = `
    <div class="kpi"><b>${L.habitaciones.length}</b><span>Reservas esta noche</span></div>
    <div class="kpi alerta"><b>${fmt1(esperadas)}</b><span>Cancelaciones esperadas</span></div>
    <div class="kpi"><b>${altos}</b><span>Riesgo alto</span></div>
    <div class="kpi"><b>$${(enRiesgo / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M</b><span>Ingreso en riesgo</span></div>
    <div class="kpi"><b>${adentro}</b><span>Huéspedes adentro</span></div>`;
}

function actualizarDecisiones() {
  const ps = probsNoche();
  const esperadas = ps.reduce((a, b) => a + b, 0);
  const pExtra = cifras.tasa_cancelacion;
  const k = Number(estado.extra);
  $('#extra').value = k;
  let sugerido = 0;
  for (let i = 0; i <= 15; i++) if (sobreventa(ps, i, pExtra, modelo.habitaciones).riesgo <= .05) sugerido = i;
  const s = sobreventa(ps, k, pExtra, modelo.habitaciones);
  $('#p1-valor').textContent = `+${k} reservas`;
  graficaP1(ps, k, pExtra);
  $('#p1-res').innerHTML = `Se esperan <b>${fmt1(esperadas)}</b> cancelaciones de 38. Con <b>${k}</b> reservas extra:
    habitaciones vacías esperadas <b>${fmt1(s.vacias)}</b> · riesgo de dejar a alguien sin cuarto <b>${fmtPct(s.riesgo)}</b>.
    <br>Colchón prudente (riesgo ≤ 5 %): <b>+${sugerido}</b>.`;

  // P2 y P3: comparan contra la situación sin la política
  const base = L.habitaciones.map(h => mapa[h.num]);
  const valor = r => r.tarifa_noche * r.noches;
  const sin = (f) => base.reduce((s, r) => s + f(r), 0);
  const conDep = r => r.p > modelo.umbral_alto && !r.deposito_pagado;
  const nDep = base.filter(conDep).length;
  const ahorroDep = sin(r => conDep(r) ? (r.p - probabilidad({ ...r, deposito_pagado: 1 })) * valor(r) : 0);
  const menosDep = sin(r => conDep(r) ? r.p - probabilidad({ ...r, deposito_pagado: 1 }) : 0);
  $('#p2-res').innerHTML = `${nDep} reservas de riesgo alto sin depósito. Pedírselo baja las cancelaciones esperadas en ${fmt1(menosDep)} y protege ≈ ${dinero(ahorroDep)} esta noche, sin molestar al resto.`;
  const esPol = r => (r.canal === 'Booking' || r.canal === 'Airbnb') && r.politica_cancelacion === 'Flexible';
  const nPol = base.filter(esPol).length;
  const menosPol = sin(r => esPol(r) ? r.p - probabilidad({ ...r, politica_cancelacion: 'Moderada' }) : 0);
  $('#p3-res').innerHTML = `${nPol} reservas Flexibles de Booking o Airbnb. Pasarlas a Moderada cambia las cancelaciones esperadas en ${fmt1(-menosPol)}. En el histórico, Booking cancela ${fmtPct(cifras.tasa_por_canal.Booking)} y pesa el ${fmtPct(cifras.share_perdido_booking)} del ingreso perdido.`;
  $('#esc-deposito').checked = estado.deposito; $('#esc-politica').checked = estado.politica;

  // Realidad
  $('#revelar').classList.toggle('on', estado.revelar);
  document.body.classList.toggle('realidad', estado.revelar);
  $('#revelar').textContent = estado.revelar ? 'Ocultar la realidad' : 'Revelar qué pasó en la realidad';
  if (estado.revelar) {
    const reales = base.filter(r => r.cancelada).length;
    const esperadoBase = base.reduce((s, r) => s + r.p, 0);
    const grupo = n => { const g = base.filter(r => nivel(r.p) === n); return [g.filter(r => r.cancelada).length, g.length]; };
    const [ca, ta] = grupo('alto'), [cm, tm] = grupo('medio'), [cb, tb] = grupo('bajo');
    $('#realidad').innerHTML = `Noche real del <b>${fechaLarga(noche.fecha)}</b>: el modelo esperaba <b>${fmt1(esperadoBase)}</b> cancelaciones y en la realidad se cancelaron <b>${reales}</b>.<br>
      Rojas: cancelaron <b>${ca} de ${ta}</b> · Amarillas: <b>${cm} de ${tm}</b> · Verdes: <b>${cb} de ${tb}</b>.`;
  } else $('#realidad').innerHTML = '';
}
// Gráfica P1: probabilidad de cada número de huéspedes que llegan (rojo = más que las 38 habitaciones)
function graficaP1(ps, k, pExtra) {
  const c = $('#p1-graf'); if (!c) return;
  const g = c.getContext('2d'), W = c.width, Hh = c.height;
  const llegar = ps.map(p => 1 - p).concat(Array(k).fill(1 - pExtra));
  const d = distribucionLlegadas(llegar);
  const cap = modelo.habitaciones, x0 = cap - 12, x1 = cap + 9;
  const max = Math.max(...d.slice(x0, x1 + 1), .01);
  g.clearRect(0, 0, W, Hh);
  const ancho = (W - 20) / (x1 - x0 + 1), base = Hh - 26;
  for (let n = x0; n <= x1; n++) {
    const v = d[n] || 0, h = v / max * (base - 10);
    g.fillStyle = n > cap ? '#e5483b' : n === cap ? '#5fd18a' : '#d9b45a';
    g.globalAlpha = n > cap ? .95 : .85;
    g.fillRect(10 + (n - x0) * ancho + 1, base - h, ancho - 2, h);
  }
  g.globalAlpha = 1;
  const xc = 10 + (cap - x0 + 1) * ancho;
  g.strokeStyle = '#ffffffcc'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xc, 4); g.lineTo(xc, base); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#a9bdb2'; g.font = '22px Inter, sans-serif'; g.textAlign = 'center';
  for (const n of [x0, cap - 8, cap - 4, cap, cap + 4, cap + 8]) g.fillText(n, 10 + (n - x0 + .5) * ancho, Hh - 4);
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '600 20px Inter, sans-serif';
  g.fillText(cap + ' habitaciones', xc - 6, 24); g.textAlign = 'left'; g.fillStyle = '#ff9b8f'; g.fillText('sin cuarto', xc + 6, 24);
}
const fechaLarga = f => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------- detalle de habitación
function seleccionar(num) {
  seleccion = seleccion === num ? null : num;
  pintar();
  if (!seleccion) $('#detalle').innerHTML = '<p class="vacio">Toca una habitación para ver su reserva y por qué el modelo le asigna ese riesgo.</p>';
}
function mostrarDetalle(num) {
  const h = L.habitaciones.find(h => h.num === num), r = mapa[num], re = reservaEscenario(r), p = probabilidad(re);
  const fac = factores(re).slice(0, 5);
  const adentro = estado.checkins[num];
  const tarjeta = Object.entries(estado.asignaciones).find(([, a]) => a.hab === num);
  let reco;
  if (adentro) reco = ['Huésped adentro: la habitación está pagada y el riesgo desaparece.', COLORES.checkin];
  else if (p > modelo.umbral_alto && !re.deposito_pagado) reco = ['Pedir depósito o pago anticipado (P2). Contarla dentro del colchón de sobreventa (P1).', COLORES.alto];
  else if (p > modelo.umbral_alto) reco = ['Riesgo alto aun con depósito: confirmar la llegada por WhatsApp el día anterior.', COLORES.alto];
  else if (p >= modelo.umbral_bajo) reco = ['Riesgo intermedio: enviar recordatorio y ofrecer pasar a tarifa con desayuno.', COLORES.medio];
  else reco = ['Riesgo bajo: no hace falta pedir depósito.', COLORES.bajo];
  $('#detalle').innerHTML = `
    <div class="cab"><h3>Hab. ${num}</h3><span class="prob" style="color:${colorDe(num)}">${adentro ? '✓' : fmtPct(p)}</span></div>
    <div style="font-size:12.5px;color:var(--suave)">${h.piso}.º piso · ${nombreAla[h.ala]} · ${r.tipo_habitacion}${tarjeta ? ` · <b style="color:var(--oro)">Llave ${tarjeta[0]}: ${escapar(tarjeta[1].nombre)}</b>` : ''}</div>
    <div class="medidor"><i style="left:${Math.min(100, p * 100)}%"></i></div>
    <div class="datos">
      <span>Canal <b>${r.canal}</b></span><span>Política <b>${re.politica_cancelacion}</b></span>
      <span>Anticipación <b>${r.anticipacion_dias} días</b></span><span>Depósito <b>${re.deposito_pagado ? 'Sí' : 'No'}</b></span>
      <span>Noches <b>${r.noches}</b></span><span>Tarifa <b>${dinero(r.tarifa_noche)}</b></span>
      <span>País <b>${r.pais_origen}</b></span><span>Reserva <b>#${r.id_reserva}</b></span>
    </div>
    <ul class="factores">${fac.map(f => `<li><span>${f.texto}</span><span class="${f.aporte > 0 ? 'sube' : 'baja'}">${f.aporte > 0 ? '▲ sube' : '▼ baja'}</span></li>`).join('')}</ul>
    <div class="reco" style="--c:${reco[1]}">${reco[0]}</div>
    ${estado.revelar ? `<div class="reco" style="--c:#fff">En la realidad esta reserva <b>${r.cancelada ? 'se canceló' : 'sí llegó'}</b>.</div>` : ''}`;
}
const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- llaves NFC
const borradores = {};
function dibujarTarjetas() {
  const cont = $('#tarjetas');
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.t : null;
  cont.innerHTML = TARJETAS.map(t => {
    const a = estado.asignaciones[t], v = vivos[t];
    const reciente = v && Date.now() - v.t < 6000;
    let est = a ? 'Asignada. Esperando que acerquen la tarjeta al celular…' : `Sin asignar. Elige una habitación (sugerida: ${HAB_SUGERIDA}) y escribe el nombre.`;
    if (a && v && v.leida) est = 'Llave leída en el celular.';
    if (a && reciente && v.dist != null) est = `En vivo · a ${Math.round(v.dist)} m de la ${a.hab} · ${v.modo === 'cerca' ? 'el loro lo está guiando 🦜' : v.modo === 'puerta' ? 'frente a su puerta' : v.modo === 'adentro' ? 'dentro de su habitación' : 'indicaciones generales'}`;
    if (a && estado.checkins[a.hab]) est = `✓ Entró a la ${a.hab}. Check-in y pago registrados.`;
    const hab = seleccion || (a && a.hab) || HAB_SUGERIDA;
    return `<div class="tarjeta">
      <div class="fila"><span class="nombre-t">Llave ${t}${a ? ` → Hab. ${a.hab}` : ''}</span><span class="pill ${reciente ? 'on' : ''}">${reciente ? '● en línea' : a ? 'activa' : 'inactiva'}</span></div>
      <div class="estado ${reciente ? 'vivo' : ''}">${est}</div>
      ${a ? `<div class="acciones"><button data-desasignar="${t}" class="sec">Desactivar llave</button></div>` :
      `<input data-t="${t}" placeholder="Nombre del huésped (ej. Profe Andrés)" value="${escapar(borradores[t] || '')}">
       <div class="acciones"><button data-asignar="${t}">Activar llave en la ${hab}</button></div>`}
    </div>`;
  }).join('');
  if (foco) { const i = cont.querySelector(`input[data-t="${foco}"]`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
$('#tarjetas').addEventListener('input', e => { if (e.target.dataset.t) borradores[e.target.dataset.t] = e.target.value; });
$('#tarjetas').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.t) asignar(e.target.dataset.t); });
$('#tarjetas').addEventListener('click', e => {
  const t = e.target.dataset.asignar, d = e.target.dataset.desasignar;
  if (t) asignar(t);
  if (d) { delete estado.asignaciones[d]; delete vivos[d]; avatares[d].visible = false; rutas[d].mesh.visible = false; rutas[d].puntos = []; etqAvatar[d].style.display = 'none'; cambiar(); aviso(`Llave ${d} desactivada`, '', COLORES.libre); }
});
function asignar(t) {
  const hab = seleccion || HAB_SUGERIDA;
  const nombre = (borradores[t] || '').trim() || 'Huésped';
  if (Object.values(estado.asignaciones).some(a => a.hab === hab)) { aviso('Esa habitación ya tiene una llave', 'Elige otra habitación.', COLORES.medio); return; }
  estado.asignaciones[t] = { hab, nombre, desde: Date.now() };
  delete estado.checkins[hab];
  hotel.abrirPuerta(hab, false);
  borradores[t] = '';
  cambiar();
  aviso(`Llave ${t} activada`, `${escapar(nombre)} · Hab. ${hab} · riesgo ${fmtPct(pAhora(hab))}`, colorDe(hab));
  sonido('ping');
}

// ---------------------------------------------------------------- sincronización
const sync = crearSync('recepcion');
sync.alCambiarConexion((ok, est) => {
  $('#conexion').classList.toggle('ok', ok);
  $('#conexion').lastElementChild.textContent = ok ? 'En línea' : est === 'INICIO' ? 'Conectando…' : 'Sin internet · solo local';
  $('#conexion').title = ok ? 'Conectado a Supabase Realtime: los celulares se sincronizan por internet' : 'Sin conexión a internet: funciona el celular simulado (tecla S) en este mismo computador';
});
function publicar() { sync.enviar('estado', { asignaciones: estado.asignaciones, checkins: estado.checkins, v: estado.v, actualizado: estado.actualizado, origen: 'recepcion' }); }
function cambiar() { estado.v++; estado.actualizado = Date.now(); guardar(); publicar(); pintar(); }
// Si hay otra pantalla de recepción abierta, gana el estado modificado más recientemente (se sincronizan entre sí)
sync.on('estado', (e) => {
  if (e.origen !== 'recepcion') return;
  if ((e.actualizado || 0) > (estado.actualizado || 0)) {
    for (const num of Object.keys(estado.checkins)) if (!e.checkins[num]) hotel.abrirPuerta(num, false);
    estado.asignaciones = e.asignaciones || {}; estado.checkins = e.checkins || {}; estado.actualizado = e.actualizado;
    guardar(); pintar();
  } else if ((e.actualizado || 0) < (estado.actualizado || 0)) publicar();
});
setInterval(publicar, 4000);

const ultimoHola = {};
sync.on('hola', ({ t }) => {
  publicar();
  vivos[t] = { ...(vivos[t] || {}), leida: true, t: Date.now() };
  const a = estado.asignaciones[t];
  const clave = t + (a ? a.desde : 'x');
  if (ultimoHola[clave] && Date.now() - ultimoHola[clave] < 30000) { dibujarTarjetas(); return; }
  ultimoHola[clave] = Date.now();
  if (a) aviso(`📱 Llave ${t} leída`, `${escapar(a.nombre)} abrió su llave en el celular.`, COLORES.bajo);
  else aviso(`📱 Llave ${t} leída`, 'La llave está inactiva: actívala para asignarle una habitación.', COLORES.libre);
  sonido('ping');
  dibujarTarjetas();
});
sync.on('pos', (d) => {
  const a = estado.asignaciones[d.t]; if (!a) return;
  const previo = vivos[d.t] && vivos[d.t].modo;
  vivos[d.t] = { ...(vivos[d.t] || {}), ...d, leida: true, t: Date.now() };
  if (previo && previo !== d.modo) {
    if (d.modo === 'cerca' && previo === 'general') { aviso(`🦜 ${escapar(a.nombre)} está a 30 m de su puerta`, 'Apareció el loro orejiamarillo y lo guía hasta la habitación.', '#2f9e44'); sonido('ping'); }
    if (d.modo === 'puerta') aviso(`🚪 ${escapar(a.nombre)} llegó a la ${a.hab}`, 'Está frente a su puerta. Falta abrir con la llave.', COLORES.medio);
  }
  const av = avatares[d.t];
  av.visible = true;
  av.userData.objetivo = new THREE.Vector3(d.x, d.y, d.z); av.userData.yaw = d.yaw;
  if (!av.userData.iniciado) { av.position.copy(av.userData.objetivo); av.userData.iniciado = true; }
  etqAvatar[d.t].style.display = '';
  etqAvatar[d.t].textContent = `${a.nombre} · ${Math.round(d.dist ?? 0)} m`;
  actualizarRuta(d.t);
  if (Date.now() - (vivos[d.t].ultimoDibujo || 0) > 700) { vivos[d.t].ultimoDibujo = Date.now(); dibujarTarjetas(); }
});
sync.on('checkin', ({ t, hab }) => {
  const a = estado.asignaciones[t];
  if (!a || a.hab !== hab || estado.checkins[hab]) { publicar(); return; }
  estado.checkins[hab] = Date.now();
  hotel.abrirPuerta(hab, true);
  rutas[t].mesh.visible = false; rutas[t].puntos = [];
  pulso[hab] = 0;
  cambiar();
  aviso(`✅ ${escapar(a.nombre)} entró a la ${hab}`, 'Check-in y pago registrados. La habitación pasa a verde oscuro.', COLORES.checkin);
  $('#cel-titulo').textContent = `${a.nombre} llegó a la ${hab}`;
  $('#cel-sub').textContent = `Check-in y pago registrados · riesgo de cancelación: de ${fmtPct(pBase(hab))} a 0 %`;
  $('#celebracion').hidden = false; confetiProyector();
  clearTimeout(celebrar.t); celebrar.t = setTimeout(() => { $('#celebracion').hidden = true; }, 4500);
  sonido('exito');
  if (vista !== 'seguir') { seleccion = hab; pintar(); }
});

const celebrar = {};
function pBase(num) { return probabilidad(reservaEscenario(mapa[num])); }
function confetiProyector() {
  const c = document.createElement('canvas'); const r = $('#escena').getBoundingClientRect();
  c.width = r.width; c.height = r.height; c.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4';
  $('#escena').appendChild(c);
  const g = c.getContext('2d'), col = ['#d9b45a', '#5fd18a', '#0f5b32', '#ffffff', '#f2c230'];
  const ps = Array.from({ length: 220 }, () => ({ x: c.width / 2 + (Math.random() - .5) * 200, y: c.height * .7, vx: (Math.random() - .5) * 16, vy: -6 - Math.random() * 10, c: col[Math.random() * 5 | 0], a: Math.random() * 6 }));
  let n = 0;
  (function f() {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.vx *= .99; p.a += .15; g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-5, -3, 10, 6); g.restore(); });
    if (n++ < 150) requestAnimationFrame(f); else c.remove();
  })();
}
// Ruta punteada del huésped hasta su puerta
const destinos = {};
function actualizarRuta(t) {
  const a = estado.asignaciones[t], v = vivos[t];
  if (!a || !v || estado.checkins[a.hab]) { rutas[t].mesh.visible = false; return; }
  destinos[a.hab] = destinos[a.hab] || prepararDestino(L, a.hab);
  const rr = ruta(L, destinos[a.hab], { x: v.x, y: v.y, z: v.z }, []);
  if (!rr) return;
  rutas[t].puntos = rr.puntos;
  rutas[t].mesh.visible = vista !== 'hotel';
}

// ---------------------------------------------------------------- avisos
function aviso(titulo, texto, color) {
  const d = document.createElement('div'); d.className = 'toast'; d.style.setProperty('--c', color || 'var(--oro)');
  d.innerHTML = `<b>${titulo}</b>${texto}`;
  $('#toasts').prepend(d);
  setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 6500);
  while ($('#toasts').children.length > 4) $('#toasts').lastElementChild.remove();
}

// ---------------------------------------------------------------- controles de la página
$('#extra').addEventListener('input', e => { estado.extra = Number(e.target.value); guardar(); actualizarDecisiones(); });
$('#esc-deposito').addEventListener('change', e => { estado.deposito = e.target.checked; guardar(); pintar(); if (estado.deposito) aviso('P2 · Depósito al riesgo alto', 'Las habitaciones rojas sin depósito se recalculan con el modelo.', COLORES.medio); });
$('#esc-politica').addEventListener('change', e => { estado.politica = e.target.checked; guardar(); pintar(); });
$('#revelar').addEventListener('click', () => { estado.revelar = !estado.revelar; guardar(); pintar(); });
$('#btn-reiniciar').addEventListener('click', () => {
  if (!confirm('¿Reiniciar la demo? Se desactivan las llaves y se borran los check-in.')) return;
  for (const num of Object.keys(estado.checkins)) hotel.abrirPuerta(num, false);
  estado = { ...inicial(), v: estado.v + 1, actualizado: Date.now() };
  Object.keys(vivos).forEach(k => delete vivos[k]);
  Object.values(avatares).forEach(a => { a.visible = false; a.userData.iniciado = false; });
  Object.values(etqAvatar).forEach(e => { e.style.display = 'none'; });
  Object.values(rutas).forEach(r => { r.mesh.visible = false; }); seleccion = null;
  sync.enviar('reinicio', {});
  cambiar(); seleccionar(null);
});
$('#btn-como').addEventListener('click', () => { $('#modal-como').hidden = false; });
$('#modal-como').addEventListener('click', e => { if (e.target.dataset.cerrar !== undefined || e.target.id === 'modal-como') $('#modal-como').hidden = true; });
$('#btn-completa').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
});
$('#btn-qr').addEventListener('click', () => {
  $('#qrs').innerHTML = TARJETAS.map(t => {
    const q = qrcode(0, 'M'); q.addData(`${URL_PUBLICA}?t=${t}`); q.make();
    return `<figure>${q.createSvgTag({ cellSize: 6, margin: 2, scalable: false })}<figcaption>Llave ${t}</figcaption></figure>`;
  }).join('');
  $('#modal-qr').hidden = false;
});
$('#modal-qr').addEventListener('click', e => { if (e.target.dataset.cerrar !== undefined || e.target.id === 'modal-qr') $('#modal-qr').hidden = true; });
$('#btn-simular').addEventListener('click', () => {
  const s = $('#celular-sim');
  if (s.hidden) { $('#sim-frame').src = `index.html?t=1&sim=1`; s.hidden = false; }
  else { s.hidden = true; $('#sim-frame').src = 'about:blank'; }
});
$('[data-cerrar-sim]').addEventListener('click', () => { $('#celular-sim').hidden = true; $('#sim-frame').src = 'about:blank'; });

// Vistas
// Distancia de cámara para que los dos planos (≈ 92 m de ancho) quepan en la pantalla, sea cual sea el proyector
function encuadre() {
  const vfov = THREE.MathUtils.degToRad(camara.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camara.aspect);
  const d = Math.max(47 / Math.tan(hfov / 2), 27 / Math.tan(vfov / 2));
  const ang = THREE.MathUtils.degToRad(58);
  return new THREE.Vector3(SEPARA / 2, Math.sin(ang) * d, 2 + Math.cos(ang) * d);
}
let vista = 'explotada';
const elev = { actual: 0, objetivo: 1 };
const camObjetivo = { pos: null, target: null };
function ponerVista(v) {
  vista = v;
  document.querySelectorAll('.vistas button').forEach(b => b.classList.toggle('activo', b.dataset.vista === v));
  elev.objetivo = v === 'hotel' ? 0 : 1;
  hotel.exterior.children.forEach(o => { if (!o.userData.suelo) o.visible = v === 'hotel'; });
  hotel.techo.visible = v === 'hotel';
  hotel.altos.forEach(g => { g.visible = v === 'hotel'; });
  controles.autoRotate = v === 'hotel'; controles.autoRotateSpeed = .6;
  for (const r of hotel.habitaciones.values()) r.vol.visible = v !== 'hotel';
  capa.style.display = v === 'hotel' ? 'none' : '';
  if (v === 'hotel') { camObjetivo.pos = new THREE.Vector3(48, 26, 58); camObjetivo.target = new THREE.Vector3(0, 4, 0); }
  if (v === 'explotada') { camObjetivo.target = new THREE.Vector3(SEPARA / 2, 0, 2); camObjetivo.pos = encuadre(); }
  Object.values(rutas).forEach(r => { r.mesh.visible = v !== 'hotel' && r.puntos.length > 1; });
}
document.querySelectorAll('.vistas button').forEach(b => b.addEventListener('click', () => ponerVista(b.dataset.vista)));
// Atajos de teclado
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '1') ponerVista('hotel');
  if (e.key === '2') ponerVista('explotada');
  if (e.key === '3') ponerVista('seguir');
  if (e.key.toLowerCase() === 'q') $('#btn-qr').click();
  if (e.key.toLowerCase() === 's') $('#btn-simular').click();
  if (e.key.toLowerCase() === 'r') $('#revelar').click();
  if (e.key.toLowerCase() === 'f') $('#btn-completa').click();
  if (e.key.toLowerCase() === 'h') $('#btn-como').click();
  if (e.key === 'Escape') { $('#modal-qr').hidden = true; $('#modal-como').hidden = true; seleccionar(seleccion); }
});

// Selección por clic en el 3D
const ray = new THREE.Raycaster(), puntero = new THREE.Vector2();
let abajo = null;
lienzo.addEventListener('pointerdown', e => { abajo = [e.clientX, e.clientY]; });
lienzo.addEventListener('pointerup', e => {
  if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 6) return;
  const r = lienzo.getBoundingClientRect();
  puntero.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(puntero, camara);
  const vols = [...hotel.habitaciones.values()].map(h => h.vol).filter(v => v.visible);
  const hit = ray.intersectObjects(vols)[0];
  if (hit) seleccionar(hit.object.userData.num);
});

// ---------------------------------------------------------------- bucle
const pulso = {};
const reloj = new THREE.Clock();
const v3 = new THREE.Vector3();
function redimensionar() {
  const r = lienzo.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camara.aspect = r.width / r.height; camara.updateProjectionMatrix();
  if (typeof vista !== 'undefined' && vista === 'explotada') camObjetivo.pos = encuadre();
}
addEventListener('resize', redimensionar); redimensionar();

let tiempo = 0;
function cuadro() {
  paso(Math.min(reloj.getDelta(), .05));
  if (document.hidden) setTimeout(cuadro, 100); else requestAnimationFrame(cuadro);
}
function paso(dt) {
  tiempo += dt; const t = tiempo;
  // elevación del piso 2
  elev.actual += (elev.objetivo - elev.actual) * (1 - Math.exp(-dt * 3));
  hotel.piso2.position.set(SEPARA * elev.actual, -(H - .03) * elev.actual, 0);
  rotulos.forEach((el, i) => { v3.set(i * SEPARA * elev.actual, 0.5, 21.5); colocar(el, v3); el.style.opacity = vista === 'hotel' ? 0 : 1; });
  // cámara: transiciones suaves y seguimiento
  if (vista === 'seguir') {
    const t1 = Object.keys(vivos).find(k => avatares[k].visible);
    if (t1) { const a = avatares[t1]; camObjetivo.target = a.position.clone(); camObjetivo.pos = a.position.clone().add(new THREE.Vector3(14, 22, 18)); }
  }
  if (camObjetivo.pos) {
    const k = 1 - Math.exp(-dt * 2.2);
    camara.position.lerp(camObjetivo.pos, k); controles.target.lerp(camObjetivo.target, k);
    if (camara.position.distanceTo(camObjetivo.pos) < .2 && vista !== 'seguir') camObjetivo.pos = null;
  }
  controles.update();
  hotel.animar(dt);
  dibujarMigas(t);
  // volúmenes: opacidad y pulso del verde oscuro
  for (const [num, r] of hotel.habitaciones) {
    const m = r.vol.material;
    let op = .62;
    if (estado.checkins[num]) op = .75 + .2 * Math.sin(t * 4 + (pulso[num] || 0));
    if (seleccion === num) op = .9;
    m.opacity += (op - m.opacity) * .15;
  }
  // avatares
  for (const [k, av] of Object.entries(avatares)) {
    if (!av.visible || !av.userData.objetivo) continue;
    const obj = av.userData.objetivo.clone(); const d = desp(obj.y); obj.x += d.x; obj.y += d.y;
    av.position.lerp(obj, 1 - Math.exp(-dt * 8));
    av.rotation.y = av.userData.yaw || 0;
    av.userData.anillo.scale.setScalar(1 + .25 * Math.sin(t * 5));
    v3.copy(av.position); v3.y += 3.6; colocar(etqAvatar[k], v3);
    if (vivos[k] && Date.now() - vivos[k].t > 15000) { av.visible = false; etqAvatar[k].style.display = 'none'; }
  }
  // etiquetas de habitaciones
  if (capa.style.display !== 'none') for (const h of L.habitaciones) {
    const d = desp(h.y); v3.set(h.cx + d.x, h.y + 2.2 + d.y, h.cz);
    colocar(etiquetas.get(h.num), v3);
  }
  renderer.render(scene, camara);
}
function colocar(el, v) {
  const p = v.clone().project(camara);
  const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
  el.classList.toggle('lejos', !visible);
  if (!visible) return;
  const w = lienzo.clientWidth, hh = lienzo.clientHeight;
  el.style.left = ((p.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - p.y) / 2 * hh) + 'px';
}

$('#subtitulo').textContent = `Recepción · noche real del ${fechaLarga(noche.fecha)} · ${noche.reservas.length} llegadas de la base`;
ponerVista('explotada');
pintar();
publicar();
cuadro();
// Para pruebas desde la consola
window.demo = { get estado() { return estado; }, mapa, hotel, L, sync, pintar, THREE, camara, controles, scene, avanzar: (s = 2) => { for (let i = 0; i < s * 30; i++) paso(1 / 30); } };
