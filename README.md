# Hotel Valle de Cocora · Llave NFC y recepción en 3D

Demo del proyecto final de **Programación Aplicada** (Universidad de La Sabana). Convierte el análisis exploratorio
de las cancelaciones del hotel en una experiencia en vivo:

- **Recepción (proyector):** https://piragua-acuatico.github.io/hotel-cocora/recepcion.html
- **Llave del huésped (tarjeta NFC):** https://piragua-acuatico.github.io/hotel-cocora/?t=1

## Qué hace

1. Recepción activa una llave para una habitación. Cada una de las 38 habitaciones (la capacidad real del caso)
   tiene una reserva real de la base: las 38 llegadas del 16-ago-2024, del año de prueba del modelo.
2. El huésped acerca la tarjeta NFC al celular y se abre su llave: bienvenida y recorrido en primera persona por el hotel.
3. A más de 30 m de su puerta recibe indicaciones generales; a 30 m o menos, un **loro orejiamarillo** (el ave
   emblema del Valle de Cocora) lo guía volando hasta la puerta.
4. Al abrirla con la llave se registra el check-in. En el proyector, esa habitación pasa a **verde oscuro**.
5. Recepción ve en todo momento el **riesgo de cancelación** de cada reserva: verde claro < 15 %, amarillo 15–30 % y
   rojo > 30 %. También puede simular las tres decisiones del proyecto:
   - **P1 · Sobreventa controlada:** la distribución exacta de huéspedes que llegan (Poisson-binomial) y el colchón con riesgo ≤ 5 %.
   - **P2 · Depósito solo al riesgo alto.**
   - **P3 · Booking y Airbnb: de Flexible a Moderada.**
   - **Revelar la realidad:** compara la predicción con lo que de verdad pasó esa noche (se esperaban 8,4 cancelaciones; hubo 8).

## Cómo está hecho

| Parte | Tecnología |
|---|---|
| Modelo | Regresión logística del cuaderno (StandardScaler + LogisticRegression, AUC 0,776), exportada a JSON con `herramientas/exportar_modelo.py`. El navegador calcula `p = 1/(1+e^-z)` y da lo mismo que sklearn. |
| 3D | Three.js r170. El hotel, las palmas de cera, el loro y las montañas están hechos con primitivas en código, sin modelos externos. |
| Navegación | Regiones caminables con rampa para la escalera, un grafo de nodos y Dijkstra inverso desde la puerta destino. |
| Tiempo real | Supabase Realtime (broadcast) entre el celular y el proyector, más BroadcastChannel para usarlo sin internet en un mismo equipo. |
| Hosting | GitHub Pages, sitio estático sin compilación. |

## Archivos

- `index.html` + `js/huesped.js`: la llave del huésped en el celular.
- `recepcion.html` + `js/recepcion.js`: la pantalla de recepción.
- `js/hotel.js`: geometría del hotel, regiones caminables y rutas.
- `js/modelo.js`: la regresión logística, los factores de cada predicción y la sobreventa.
- `js/loro.js`, `js/sync.js`, `js/audio.js`, `js/datos.js`.
- `data/`: `modelo.json` (coeficientes), `noche.json` (38 reservas reales) y `cifras.json` (cifras del informe).

Atajos en recepción: `1` `2` `3` vistas · `Q` QR de respaldo · `S` celular simulado · `R` revelar · `H` cómo funciona · `F` pantalla completa.
