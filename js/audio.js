// Sonidos sintetizados con Web Audio (sin archivos externos).
let ctx = null;
export function desbloquearAudio() {
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { /* sin audio */ }
}
addEventListener('pointerdown', desbloquearAudio, { once: true });

function tono(f0, f1, dur, tipo = 'sine', vol = .15, retraso = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + retraso;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .05);
}

export function sonido(nombre) {
  if (!ctx) return;
  if (nombre === 'ping') { tono(880, 880, .18, 'sine', .12); tono(1320, 1320, .25, 'sine', .08, .09); }
  if (nombre === 'loro') { tono(1800, 2600, .07, 'square', .05); tono(2600, 1500, .09, 'square', .05, .08); tono(1700, 2900, .06, 'square', .04, .2); }
  if (nombre === 'clic') { tono(220, 120, .06, 'square', .12); tono(500, 300, .05, 'square', .1, .09); }
  if (nombre === 'exito') { [523, 659, 784, 1047].forEach((f, i) => tono(f, f, .35, 'triangle', .12, i * .11)); }
  if (nombre === 'cerca') { tono(660, 990, .25, 'sine', .1); }
}
