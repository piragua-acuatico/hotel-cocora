// Asignación determinista de las 38 reservas reales de la noche a las 38 habitaciones.
// El celular y la recepción la calculan igual, así no hace falta enviar los datos por la red.
import { probabilidad, nivel } from './modelo.js';

export const HAB_SUGERIDA = '210'; // habitación lejana (2.º piso, ala norte) ideal para la demo

export function mapaHabitaciones(habitaciones, reservas) {
  const lista = reservas.map(r => ({ ...r, p: probabilidad(r) }));
  lista.forEach(r => { r.nivel = nivel(r.p); });
  const libres = habitaciones.map(h => h.num);
  const mapa = {};
  const tomar = (num, r) => { mapa[num] = r; libres.splice(libres.indexOf(num), 1); lista.splice(lista.indexOf(r), 1); };

  // Habitación de la demo: una reserva de riesgo intermedio (amarillo), para que se vea el cambio a verde oscuro
  const media = lista.filter(r => r.nivel === 'medio' && r.tipo_habitacion !== 'Suite').sort((a, b) => b.p - a.p)[0];
  if (media) tomar(HAB_SUGERIDA, media);
  // Suites en el 2.º piso del ala norte, familiares en las alas del 1.er piso
  const suites = ['208', '209', '211', '212', '207', '213'];
  for (const r of lista.filter(r => r.tipo_habitacion === 'Suite')) { const n = suites.find(s => libres.includes(s)); if (n) tomar(n, r); }
  const familiares = ['103', '104', '116', '115', '102', '117'];
  for (const r of lista.filter(r => r.tipo_habitacion === 'Familiar')) { const n = familiares.find(s => libres.includes(s)); if (n) tomar(n, r); }
  // El resto, mezclado con semilla fija
  let s = 2026;
  const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const resto = [...lista];
  for (let i = resto.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [resto[i], resto[j]] = [resto[j], resto[i]]; }
  const huecos = [...libres];
  resto.forEach((r, i) => { mapa[huecos[i]] = r; });
  return mapa;
}

export const nombreAla = { norte: 'ala norte', sur: 'ala sur', este: 'ala oriental', oeste: 'ala occidental' };
