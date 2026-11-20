// Loro orejiamarillo (Ognorhynchus icterotis), ave emblema del Valle de Cocora que anida en la palma de cera.
// Modelo low-poly hecho con primitivas: cuerpo verde, mejillas amarillas, pico oscuro, alas que aletean.
import * as THREE from 'three';

export function crearLoro() {
  const verde = new THREE.MeshLambertMaterial({ color: '#2f9e44', flatShading: true });
  const verdeOsc = new THREE.MeshLambertMaterial({ color: '#1f6f30', flatShading: true });
  const amarillo = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#4a3a00', flatShading: true });
  const pico = new THREE.MeshLambertMaterial({ color: '#2b2b2b' });
  const ojo = new THREE.MeshBasicMaterial({ color: '#111' });
  const brilloMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: .35, depthWrite: false });

  const loro = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), verde); cuerpo.scale.set(.85, .85, 1.35); loro.add(cuerpo);
  const pecho = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), new THREE.MeshLambertMaterial({ color: '#7fc96b', flatShading: true }));
  pecho.position.set(0, -.05, -.1); pecho.scale.set(.9, .9, 1.1); loro.add(pecho);
  const cabeza = new THREE.Group(); cabeza.position.set(0, .14, -.27); loro.add(cabeza);
  cabeza.add(new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), verde));
  for (const s of [-1, 1]) {
    const mejilla = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), amarillo); mejilla.position.set(s * .1, -.01, -.05); mejilla.scale.set(.6, 1, 1.2); cabeza.add(mejilla);
    const o = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 4), ojo); o.position.set(s * .1, .04, -.09); cabeza.add(o);
  }
  const picoM = new THREE.Mesh(new THREE.ConeGeometry(.06, .14, 6), pico); picoM.rotation.x = -Math.PI / 2 - .5; picoM.position.set(0, -.04, -.16); cabeza.add(picoM);
  const cola = new THREE.Mesh(new THREE.ConeGeometry(.09, .5, 4), verdeOsc); cola.rotation.x = Math.PI / 2 + .25; cola.position.set(0, -.04, .45); cola.scale.set(1, 1, .35); loro.add(cola);

  const alas = [];
  for (const s of [-1, 1]) {
    const pivote = new THREE.Group(); pivote.position.set(s * .15, .06, -.02);
    const ala = new THREE.Mesh(new THREE.BoxGeometry(.5, .03, .3), verdeOsc); ala.position.x = s * .25;
    const punta = new THREE.Mesh(new THREE.BoxGeometry(.22, .025, .2), new THREE.MeshLambertMaterial({ color: '#2a5fae', flatShading: true }));
    punta.position.x = s * .55; punta.position.z = .04;
    pivote.add(ala, punta); pivote.userData.s = s; loro.add(pivote); alas.push(pivote);
  }
  // halo suave para que se vea de lejos
  const brillo = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8), brilloMat); loro.add(brillo);
  loro.scale.setScalar(1.0);
  loro.visible = false;

  let t = 0, aleteo = 1;
  return {
    grupo: loro,
    // velocidad: magnitud del movimiento; posado: si está quieto sobre la puerta
    animar(dt, { posado = false } = {}) {
      t += dt;
      aleteo += ((posado ? 0 : 1) - aleteo) * Math.min(1, dt * 5);
      const a = Math.sin(t * 18) * .9 * aleteo + (1 - aleteo) * -.15;
      alas.forEach(p => { p.rotation.z = p.userData.s * a; });
      cabeza.rotation.y = posado ? Math.sin(t * 1.7) * .5 : 0;
      cola.rotation.x = Math.PI / 2 + .25 + Math.sin(t * 3) * .06;
      brillo.visible = !posado;
      brillo.material.opacity = .1 + .07 * Math.sin(t * 4);
    },
  };
}
