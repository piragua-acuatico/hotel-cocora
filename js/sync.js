// Sincronización en tiempo real entre el celular del huésped y la pantalla de recepción.
// Usa dos vías a la vez y descarta duplicados:
//  1) Supabase Realtime (broadcast): funciona por internet entre dispositivos distintos.
//  2) BroadcastChannel: funciona entre pestañas del mismo navegador, incluso sin internet (plan B).
import { SUPABASE_URL, SUPABASE_KEY, CANAL } from './config.js';

export function crearSync(origen) {
  const oyentes = {};
  const vistos = new Set();
  const yo = origen + '-' + Math.random().toString(36).slice(2, 8);
  let enLinea = false;
  let alCambiarConexion = () => {};

  function recibir(msg) {
    if (!msg || msg.de === yo || vistos.has(msg.id)) return;
    vistos.add(msg.id);
    if (vistos.size > 500) vistos.delete(vistos.values().next().value);
    (oyentes[msg.evento] || []).forEach(cb => { try { cb(msg.datos, msg); } catch (e) { console.error(e); } });
  }

  // Vía local
  let local = null;
  try { local = new BroadcastChannel(CANAL); local.onmessage = e => recibir(e.data); } catch (e) { /* sin soporte */ }

  // Vía Supabase
  let canal = null;
  try {
    if (window.supabase && navigator.onLine !== false) {
      const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: { params: { eventsPerSecond: 20 } },
      });
      canal = cliente.channel(CANAL, { config: { broadcast: { self: false, ack: false } } });
      canal.on('broadcast', { event: 'm' }, ({ payload }) => recibir(payload));
      canal.subscribe(estado => {
        enLinea = estado === 'SUBSCRIBED';
        alCambiarConexion(enLinea, estado);
      });
    }
  } catch (e) { console.warn('Supabase no disponible', e); }

  return {
    yo,
    get enLinea() { return enLinea; },
    alCambiarConexion(cb) { alCambiarConexion = cb; cb(enLinea, 'INICIO'); },
    on(evento, cb) { (oyentes[evento] = oyentes[evento] || []).push(cb); },
    enviar(evento, datos) {
      const msg = { id: yo + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), de: yo, evento, datos, t: Date.now() };
      vistos.add(msg.id);
      if (local) try { local.postMessage(msg); } catch (e) { /* nada */ }
      if (canal && enLinea) canal.send({ type: 'broadcast', event: 'm', payload: msg }).catch(() => {});
    },
  };
}
