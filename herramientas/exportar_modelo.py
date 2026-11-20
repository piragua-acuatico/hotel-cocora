"""Exporta la regresión logística del cuaderno (Paso 11) a JSON para la demo web.

Reproduce exactamente el preprocesamiento del cuaderno EDA_Hotel_Valle_de_Cocora_Codigo.ipynb:
deduplicado, "No registrado" en nulos, ventana confiable y partición temporal (entrena antes de jul-2024).
Uso:  python -I exportar_modelo.py <ruta hotel_reservas.csv> <carpeta de salida>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEMILLA = 42
INI_VENTANA = pd.Timestamp("2023-05-01")
FIN_VENTANA = pd.Timestamp("2025-06-18")
HABITACIONES = 38

csv, salida = Path(sys.argv[1]), Path(sys.argv[2])
salida.mkdir(parents=True, exist_ok=True)

raw = pd.read_csv(csv, parse_dates=["fecha_reserva", "fecha_llegada"])
df = raw.drop_duplicates().copy()
df["canal"] = df["canal"].fillna("No registrado")
df["pais_origen"] = df["pais_origen"].fillna("No registrado")
df["ingreso_potencial"] = df["tarifa_noche"] * df["noches"]
df["ingreso_perdido"] = df["ingreso_potencial"] * df["cancelada"]
dv = df[df["fecha_llegada"].between(INI_VENTANA, FIN_VENTANA)].copy()

feats_cat = ["tipo_habitacion", "canal", "pais_origen", "politica_cancelacion"]
feats_num = ["anticipacion_dias", "noches", "adultos", "ninos", "tarifa_noche", "deposito_pagado", "huesped_recurrente",
             "solicitudes_especiales", "cancelaciones_previas", "incluye_desayuno", "mes_llegada"]

y = dv.cancelada
es_tr = dv.fecha_llegada < "2024-07-01"
XL = pd.get_dummies(dv[feats_cat + feats_num], columns=feats_cat, drop_first=True).astype(float)
lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, random_state=SEMILLA)).fit(XL[es_tr], y[es_tr])
p_test = lr.predict_proba(XL[~es_tr])[:, 1]
auc = roc_auc_score(y[~es_tr], p_test)
print(f"AUC regresión logística (prueba): {auc:.3f}   (cuaderno: 0.776)")

sc, m = lr.named_steps["standardscaler"], lr.named_steps["logisticregression"]
cols = list(XL.columns)

# Niveles de referencia (drop_first) por variable categórica
niveles = {c: sorted(dv[c].unique().tolist()) for c in feats_cat}

modelo = {
    "fuente": "Regresión logística del cuaderno (Paso 11): StandardScaler + LogisticRegression, entrenada con llegadas "
              "1-may-2023 → 30-jun-2024 y evaluada en 1-jul-2024 → 18-jun-2025.",
    "auc_prueba": round(float(auc), 4),
    "intercepto": float(m.intercept_[0]),
    "columnas": cols,
    "media": [float(v) for v in sc.mean_],
    "escala": [float(v) for v in sc.scale_],
    "coef": [float(v) for v in m.coef_[0]],
    "categoricas": feats_cat,
    "numericas": feats_num,
    "niveles": niveles,
    "umbral_alto": 0.30,
    "umbral_bajo": 0.15,
    "habitaciones": HABITACIONES,
}


def proba_manual(fila: dict) -> float:
    z = modelo["intercepto"]
    for i, col in enumerate(cols):
        if col in feats_num:
            x = float(fila[col])
        else:
            var, nivel = next((c, col[len(c) + 1:]) for c in feats_cat if col.startswith(c + "_"))
            x = 1.0 if fila[var] == nivel else 0.0
        z += modelo["coef"][i] * (x - modelo["media"][i]) / modelo["escala"][i]
    return 1 / (1 + np.exp(-z))


# Verificación: la fórmula manual (la misma que usa el JavaScript) reproduce a sklearn
te = dv[~es_tr].copy()
te["p"] = p_test
muestra = te.sample(500, random_state=SEMILLA)
dif = max(abs(proba_manual(r) - r["p"]) for r in muestra.to_dict("records"))
print(f"Máxima diferencia fórmula manual vs sklearn: {dif:.2e}")
assert dif < 1e-9

# Una noche real del año de prueba: se eligen 38 llegadas (capacidad del hotel) con mezcla real de riesgo
noches = te.groupby("fecha_llegada").size()
candidatas = noches[noches >= 80].index
rng = np.random.default_rng(SEMILLA)
mejor = None
for fecha in candidatas:
    d = te[te.fecha_llegada == fecha]
    s = d.sample(HABITACIONES, random_state=SEMILLA)
    altos, bajos = (s.p > .30).sum(), (s.p < .15).sum()
    # Noche "representativa": tasa real cercana al 19 % y mezcla de los tres niveles de riesgo
    puntaje = abs(s.cancelada.mean() - .19) * 10 + abs(altos - 9) + abs(bajos - 14) * .5
    if mejor is None or puntaje < mejor[0]:
        mejor = (puntaje, fecha, s)
_, fecha, noche = mejor
print(f"Noche elegida: {fecha.date()} · {len(noche)} reservas · canceladas reales {noche.cancelada.sum()} "
      f"· suma de probabilidades {noche.p.sum():.1f} · altos {(noche.p>.30).sum()} · bajos {(noche.p<.15).sum()}")

campos = ["id_reserva", "fecha_reserva", "fecha_llegada"] + feats_cat + feats_num + ["cancelada"]
reservas = []
for r in noche.sort_values("p", ascending=False).to_dict("records"):
    item = {k: r[k] for k in campos}
    item["fecha_reserva"] = r["fecha_reserva"].strftime("%Y-%m-%d")
    item["fecha_llegada"] = r["fecha_llegada"].strftime("%Y-%m-%d")
    for k in feats_num + ["id_reserva", "cancelada"]:
        item[k] = int(item[k]) if float(item[k]).is_integer() else float(item[k])
    item["p_sklearn"] = round(float(r["p"]), 6)
    reservas.append(item)

# Cifras del informe para el panel (base completa, como el PDF)
cifras = {
    "reservas_unicas": int(len(df)),
    "tasa_cancelacion": round(float(df.cancelada.mean()), 4),
    "ingreso_perdido": float(df.ingreso_perdido.sum()),
    "ingreso_potencial": float(df.ingreso_potencial.sum()),
    "tasa_sin_deposito": round(float(df.loc[df.deposito_pagado == 0, "cancelada"].mean()), 4),
    "tasa_con_deposito": round(float(df.loc[df.deposito_pagado == 1, "cancelada"].mean()), 4),
    "tasa_por_canal": {k: round(float(v), 4) for k, v in df.groupby("canal").cancelada.mean().items()},
    "tasa_por_politica": {k: round(float(v), 4) for k, v in df.groupby("politica_cancelacion").cancelada.mean().items()},
    "share_perdido_booking": round(float(df.loc[df.canal == "Booking", "ingreso_perdido"].sum() / df.ingreso_perdido.sum()), 4),
}

(salida / "modelo.json").write_text(json.dumps(modelo, ensure_ascii=False, indent=1), encoding="utf-8")
(salida / "noche.json").write_text(json.dumps({"fecha": fecha.strftime("%Y-%m-%d"), "reservas": reservas},
                                              ensure_ascii=False, indent=1), encoding="utf-8")
(salida / "cifras.json").write_text(json.dumps(cifras, ensure_ascii=False, indent=1), encoding="utf-8")
print("Listo:", [p.name for p in salida.iterdir()])
