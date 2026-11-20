// Regresión logística exportada del cuaderno (Paso 11). Fórmula idéntica a sklearn:
// z = b0 + Σ coef_i · (x_i − media_i) / escala_i ;  p = 1 / (1 + e^−z)
let M = null;

export async function cargarModelo(base = '') {
  const [modelo, noche, cifras] = await Promise.all(
    ['modelo', 'noche', 'cifras'].map(n => fetch(`${base}data/${n}.json`).then(r => r.json())));
  M = modelo;
  return { modelo, noche, cifras };
}

function valor(reserva, col) {
  if (M.numericas.includes(col)) return Number(reserva[col]);
  const v = M.categoricas.find(c => col.startsWith(c + '_'));
  return reserva[v] === col.slice(v.length + 1) ? 1 : 0;
}

export function probabilidad(reserva) {
  let z = M.intercepto;
  M.columnas.forEach((c, i) => { z += M.coef[i] * (valor(reserva, c) - M.media[i]) / M.escala[i]; });
  return 1 / (1 + Math.exp(-z));
}

export function nivel(p) {
  if (p > M.umbral_alto) return 'alto';
  if (p >= M.umbral_bajo) return 'medio';
  return 'bajo';
}

const dinero = n => '$' + Math.round(n).toLocaleString('es-CO');
export { dinero };

// Etiqueta legible de cada factor para explicar la predicción
function etiqueta(r, col) {
  switch (col) {
    case 'anticipacion_dias': return `Reservó con ${r.anticipacion_dias} días de anticipación`;
    case 'deposito_pagado': return r.deposito_pagado ? 'Pagó por adelantado' : 'Sin pago por adelantado';
    case 'cancelaciones_previas': return r.cancelaciones_previas ? `${r.cancelaciones_previas} cancelación(es) previa(s)` : 'Sin cancelaciones previas';
    case 'huesped_recurrente': return r.huesped_recurrente ? 'Huésped recurrente' : 'Primera visita';
    case 'solicitudes_especiales': return `${r.solicitudes_especiales} solicitud(es) especial(es)`;
    case 'noches': return `${r.noches} noche(s)`;
    case 'tarifa_noche': return `Tarifa ${dinero(r.tarifa_noche)} por noche`;
    case 'incluye_desayuno': return r.incluye_desayuno ? 'Con desayuno' : 'Sin desayuno';
    case 'adultos': return `${r.adultos} adulto(s)`;
    case 'ninos': return `${r.ninos} niño(s)`;
    case 'mes_llegada': return `Llega en el mes ${r.mes_llegada}`;
  }
  const v = M.categoricas.find(c => col.startsWith(c + '_'));
  const nombres = { canal: 'Canal', politica_cancelacion: 'Política', tipo_habitacion: 'Habitación', pais_origen: 'País' };
  return `${nombres[v]} ${r[v]}`;
}

// Aporte de cada variable al logit, relativo a la reserva promedio. Agrupa las dummies por variable.
export function factores(r) {
  const grupos = {};
  M.columnas.forEach((c, i) => {
    const v = M.categoricas.find(k => c.startsWith(k + '_')) || c;
    const aporte = M.coef[i] * (valor(r, c) - M.media[i]) / M.escala[i];
    grupos[v] = grupos[v] || { col: v, aporte: 0 };
    grupos[v].aporte += aporte;
  });
  return Object.values(grupos)
    .map(g => ({ ...g, texto: etiqueta(r, M.categoricas.includes(g.col) ? `${g.col}_${r[g.col]}` : g.col) }))
    .sort((a, b) => Math.abs(b.aporte) - Math.abs(a.aporte));
}

// Distribución exacta del número de huéspedes que llegan (Poisson-binomial)
export function distribucionLlegadas(probsLlegar) {
  let d = [1];
  for (const q of probsLlegar) {
    const n = new Array(d.length + 1).fill(0);
    d.forEach((v, k) => { n[k] += v * (1 - q); n[k + 1] += v * q; });
    d = n;
  }
  return d;
}

// Pregunta 1: con k reservas extra, riesgo de dejar a alguien sin habitación y habitaciones vacías esperadas
export function sobreventa(probsCancelar, extra, pExtra, capacidad) {
  const llegar = probsCancelar.map(p => 1 - p).concat(Array(extra).fill(1 - pExtra));
  const d = distribucionLlegadas(llegar);
  let riesgo = 0, vacias = 0, sinCuarto = 0;
  d.forEach((v, k) => {
    if (k > capacidad) { riesgo += v; sinCuarto += v * (k - capacidad); }
    else vacias += v * (capacidad - k);
  });
  return { riesgo, vacias, sinCuarto };
}
