"""
Fertilizer Recommendation API
------------------------------
Flask backend that wraps the trained scikit-learn models
(fertilizer_model_v2.pkl, dosage_model.pkl, and the label encoders)
and exposes them over a small JSON REST API for the React frontend.

This replaces the old Streamlit dashboard (dashboard.py) - all the
same logic (prediction, confidence, top-3 alternatives, dosage
estimate, cost & sustainability comparison) now lives here.
"""

import os
import warnings

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

warnings.filterwarnings("ignore")  # silence sklearn version-mismatch warnings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

app = Flask(__name__)
CORS(app)  # allow the React dev server (different port) to call this API

# --------------------------------------------------------------------------
# Load models & encoders once at startup
# --------------------------------------------------------------------------
model = joblib.load(os.path.join(MODELS_DIR, "fertilizer_model_v2.pkl"))
dosage_model = joblib.load(os.path.join(MODELS_DIR, "dosage_model.pkl"))
le_soil = joblib.load(os.path.join(MODELS_DIR, "soil_encoder.pkl"))
le_crop = joblib.load(os.path.join(MODELS_DIR, "crop_encoder_v2.pkl"))
le_fert = joblib.load(os.path.join(MODELS_DIR, "fertilizer_encoder_v2.pkl"))

FEATURE_COLS = [
    "Temparature",
    "Humidity ",
    "Moisture",
    "Nitrogen",
    "Potassium",
    "Phosphorous",
    "soil_encoded",
    "crop_encoded2",
]

# Same price / environmental-impact lookup used in the Streamlit dashboard
FERTILIZER_PROFILE = {
    "Urea": {"price_per_kg": 6, "env_impact": 7},
    "DAP": {"price_per_kg": 27, "env_impact": 6},
    "MOP": {"price_per_kg": 17, "env_impact": 4},
    "14-35-14": {"price_per_kg": 30, "env_impact": 5},
    "28-28": {"price_per_kg": 24, "env_impact": 6},
    "17-17-17": {"price_per_kg": 28, "env_impact": 4},
    "20-20": {"price_per_kg": 22, "env_impact": 6},
    "10-26-26": {"price_per_kg": 26, "env_impact": 5},
}


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/options", methods=["GET"])
def options():
    """Returns the dropdown choices the frontend needs (soil types, crops)."""
    return jsonify(
        {
            "soil_types": list(le_soil.classes_),
            "crop_types": list(le_crop.classes_),
        }
    )


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True) or {}

    required = [
        "soil_type",
        "crop_type",
        "temperature",
        "humidity",
        "moisture",
        "nitrogen",
        "potassium",
        "phosphorous",
    ]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        soil_type = data["soil_type"]
        crop_type = data["crop_type"]
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        moisture = float(data["moisture"])
        nitrogen = float(data["nitrogen"])
        potassium = float(data["potassium"])
        phosphorous = float(data["phosphorous"])

        soil_encoded = le_soil.transform([soil_type])[0]
        crop_encoded = le_crop.transform([crop_type])[0]

        input_data = pd.DataFrame(
            [
                [
                    temperature,
                    humidity,
                    moisture,
                    nitrogen,
                    potassium,
                    phosphorous,
                    soil_encoded,
                    crop_encoded,
                ]
            ],
            columns=FEATURE_COLS,
        )

        proba = model.predict_proba(input_data)[0]
        top_idx = int(proba.argmax())
        top_fertilizer = le_fert.classes_[top_idx]
        top_confidence = float(proba[top_idx])

        top3_idx = proba.argsort()[::-1][:3]
        alternatives = [
            {"fertilizer": le_fert.classes_[i], "probability": float(proba[i])}
            for i in top3_idx
        ]

        # Dosage estimate
        dosage_input = pd.DataFrame(
            [
                [
                    temperature,
                    humidity,
                    moisture,
                    nitrogen,
                    potassium,
                    phosphorous,
                    soil_encoded,
                    crop_encoded,
                    top_idx,
                ]
            ],
            columns=FEATURE_COLS + ["fertilizer_encoded2"],
        )
        estimated_dosage = float(dosage_model.predict(dosage_input)[0])

        # Cost & sustainability comparison for the top 3
        comparison = []
        for i in top3_idx:
            fert_name = le_fert.classes_[i]
            profile = FERTILIZER_PROFILE.get(
                fert_name, {"price_per_kg": None, "env_impact": None}
            )
            comparison.append(
                {
                    "fertilizer": fert_name,
                    "confidence": float(proba[i]),
                    "price_per_kg": profile["price_per_kg"],
                    "env_impact": profile["env_impact"],
                }
            )

        return jsonify(
            {
                "recommended_fertilizer": top_fertilizer,
                "confidence": top_confidence,
                "low_confidence": top_confidence < 0.6,
                "alternatives": alternatives,
                "estimated_dosage_kg_per_hectare": round(estimated_dosage, 1),
                "comparison": comparison,
            }
        )

    except ValueError as e:
        # e.g. an unseen label passed to a LabelEncoder
        return jsonify({"error": str(e)}), 400
    except Exception as e:  # pragma: no cover
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
