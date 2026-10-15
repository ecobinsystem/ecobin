from pathlib import Path
import atexit
import json
import os
import signal
import time
from hmac import compare_digest

import cv2
import numpy as np
import requests
import tensorflow as tf
from env_loader import load_env_file
from firebase_service import (
    firebase_status,
    initialize_firebase,
    record_classification,
    record_esp32_session,
    record_esp32_status,
    record_trash_level,
)

from flask import Flask, jsonify, request
from flask_cors import CORS
from pi_hardware import hardware


# ============================================================
# ECOBIN AI SERVER
# Camera → AI Model → ESP32 → Servo
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
load_env_file(BASE_DIR / ".env")

MODEL_PATH = BASE_DIR / "waste_classifier.keras"
META_PATH = BASE_DIR / "class_names.json"


# ============================================================
# WASTE CLASSES
# ============================================================

CLASS_NAMES = [
    "biodegradable",
    "human",
    "recyclable",
    "residual"
]

IMG_SIZE = 224

# Minimum AI confidence required
CONFIDENCE_THRESHOLD = 0.60


# ============================================================
# ESP32 SETTINGS
# ============================================================

ESP32_IP = (os.getenv("ESP32_IP") or os.getenv("VITE_ESP32_IP") or "192.168.43.25").strip()
ESP32_URL = f"http://{ESP32_IP}"
ESP32_DEVICE_TOKEN = os.getenv("ESP32_DEVICE_TOKEN", "").strip()

# Prevent repeated commands too quickly
COMMAND_COOLDOWN = 5.0
last_command_time = 0.0


# ============================================================
# FLASK
# ============================================================

app = Flask(__name__)
CORS(app)


# ============================================================
# LOAD AI MODEL
# ============================================================

print()

firebase_ready = initialize_firebase()
print("Firebase:", "READY" if firebase_ready else firebase_status()["message"])
print()
print("=" * 60)
print("              ECOBIN AI SYSTEM")
print("=" * 60)
print()

print("Loading AI model...")

try:
    model = tf.keras.models.load_model(MODEL_PATH)

    print("AI model loaded successfully!")

except Exception as e:

    print("ERROR: Could not load AI model.")
    print(e)

    raise


# ============================================================
# LOAD CLASS NAMES
# ============================================================

if META_PATH.exists():

    try:

        meta = json.loads(
            META_PATH.read_text(
                encoding="utf-8"
            )
        )

        loaded_classes = meta.get(
            "class_names"
        )

        if (
            isinstance(loaded_classes, list)
            and len(loaded_classes) >= 3
        ):

            CLASS_NAMES = loaded_classes

        print(
            "Class names:",
            CLASS_NAMES
        )

    except Exception as e:

        print(
            "WARNING: Could not read class_names.json"
        )

        print(e)


print()
print("ESP32 URL:", ESP32_URL)
print(
    "Confidence threshold:",
    f"{CONFIDENCE_THRESHOLD * 100:.0f}%"
)
print()


def init_hardware():
    hardware.initialize()
    hardware.start_telemetry(interval=10.0, callback=record_trash_level)


# ============================================================
# IMAGE CLASSIFICATION
# ============================================================

def classify_image(jpeg_bytes):

    # Convert image bytes to NumPy array
    arr = np.frombuffer(
        jpeg_bytes,
        dtype=np.uint8
    )

    # Decode JPEG
    bgr = cv2.imdecode(
        arr,
        cv2.IMREAD_COLOR
    )

    if bgr is None:

        raise ValueError(
            "Could not decode image"
        )

    # BGR → RGB
    rgb = cv2.cvtColor(
        bgr,
        cv2.COLOR_BGR2RGB
    )

    # Resize
    rgb = cv2.resize(
        rgb,
        (IMG_SIZE, IMG_SIZE),
        interpolation=cv2.INTER_AREA
    )

    # Convert to float32
    x = rgb.astype(np.float32)

    # Add batch dimension
    x = np.expand_dims(
        x,
        axis=0
    )

    # AI prediction
    probs = model.predict(
        x,
        verbose=0
    )[0]

    # Safety check
    if len(probs) != len(CLASS_NAMES):

        raise ValueError(
            "Model output does not match "
            "the number of class names."
        )

    # Highest probability
    idx = int(
        np.argmax(probs)
    )

    label = CLASS_NAMES[idx]

    confidence = float(
        probs[idx]
    )

    probabilities = {
        CLASS_NAMES[i]: float(probs[i])
        for i in range(len(CLASS_NAMES))
    }

    return (
        label,
        confidence,
        probabilities
    )


# ============================================================
# SEND COMMAND TO ESP32
# ============================================================

def send_to_esp32(label):
    global last_command_time
    current_time = time.time()
    elapsed = current_time - last_command_time

    if elapsed < COMMAND_COOLDOWN:
        remaining = COMMAND_COOLDOWN - elapsed
        return {
            "success": False,
            "sent": False,
            "message": "Command cooldown active",
            "cooldown_remaining": round(remaining, 1)
        }

    res = hardware.open_lid(label)
    if res.get("sent"):
        last_command_time = current_time
    return res


# ============================================================
# CAMERA CLASSIFICATION ENDPOINT
# ============================================================

@app.route(
    "/classify",
    methods=["POST"]
)
def classify():

    print()
    print("-" * 60)
    print("NEW CAMERA IMAGE RECEIVED")
    print("-" * 60)


    # --------------------------------------------------------
    # CHECK IMAGE
    # --------------------------------------------------------

    if "image" not in request.files:

        print(
            "ERROR: No image received."
        )

        return jsonify({
            "ok": False,
            "error": (
                "Missing multipart field: image"
            )
        }), 400


    try:

        # Read image
        image_bytes = (
            request.files["image"].read()
        )

        if not image_bytes:

            raise ValueError(
                "Received empty image"
            )


        # ----------------------------------------------------
        # AI CLASSIFICATION
        # ----------------------------------------------------

        (
            label,
            confidence,
            probabilities
        ) = classify_image(
            image_bytes
        )


    except Exception as e:

        print(
            "AI classification error:",
            e
        )

        return jsonify({
            "ok": False,
            "error": str(e)
        }), 400


    # ========================================================
    # SHOW AI RESULT
    # ========================================================

    print()
    print("AI RESULT")
    print("-" * 60)

    print(
        "Detected waste:",
        label
    )

    print(
        f"Confidence: "
        f"{confidence * 100:.2f}%"
    )

    print("Probabilities:")

    for name, probability in (
        probabilities.items()
    ):

        print(
            f"  {name}: "
            f"{probability * 100:.2f}%"
        )


    # ========================================================
    # CONFIDENCE CHECK
    # ========================================================

    accepted = (
        confidence
        >= CONFIDENCE_THRESHOLD
    )

    print()

    print(
        "Required confidence:",
        f"{CONFIDENCE_THRESHOLD * 100:.0f}%"
    )

    print(
        "Accepted:",
        accepted
    )


    # ========================================================
    # DEFAULT COMMAND RESULT
    # ========================================================

    command_result = {
        "success": False,
        "sent": False,
        "message": (
            "Prediction below confidence threshold"
        )
    }


    # ========================================================
    # SEND TO ESP32
    # ========================================================

    if accepted:

        print()
        print(
            "AI confidence accepted."
        )

        if label == "human":
            print(
                "Human detected. Not opening any lid."
            )
            command_result = {
                "success": True,
                "sent": False,
                "message": "Human detected - Ignored"
            }
        else:
            print(
                "Sending command immediately..."
            )

            command_result = send_to_esp32(
                label
            )

    else:

        print()
        print(
            "COMMAND NOT SENT"
        )

        print(
            "Reason: AI confidence is below "
            f"{CONFIDENCE_THRESHOLD * 100:.0f}%"
        )


    # ========================================================
    # FINAL RESULT
    # ========================================================

    print()
    print("-" * 60)

    if command_result["sent"]:

        print(
            "RESULT: COMMAND SENT TO ESP32"
        )

    else:

        print(
            "RESULT: COMMAND NOT SENT"
        )

    print("-" * 60)
    print()


    firebase_saved = record_classification({
        "waste_type": label,
        "confidence": confidence,
        "accepted": accepted,
        "command_sent": command_result["sent"],
        "message": command_result["message"],
        "probabilities": probabilities,
    })

    print(
        f"Firestore: {'SAVED' if firebase_saved else 'NOT SAVED'}"
    )


    # ========================================================
    # RESPONSE TO CAMERA
    # ========================================================

    return jsonify({

        "ok": True,

        "class": label,

        "confidence": confidence,

        "accepted": accepted,

        "command_sent": (
            command_result["sent"]
        ),

        "probabilities": probabilities,

        "message": command_result["message"],

        "esp32_response": (
            command_result.get(
                "esp32_response"
            )
        ),

        "firebase_saved": firebase_saved

    })


# ============================================================
# ESP32 STATUS
# ============================================================

@app.route(
    "/esp32-status",
    methods=["GET"]
)
def esp32_status():
    levels = hardware.read_all_levels()
    return jsonify({
        "python_server": True,
        "esp32_online": True,
        "hardware_mode": "gpio" if hardware.enabled else "simulated",
        "esp32_data": levels,
        "firebase_saved": True
    })


# ============================================================
# PYTHON SERVER STATUS
# ============================================================

@app.route(
    "/status",
    methods=["GET"]
)
def status():

    return jsonify({

        "ok": True,

        "server": "ECOBIN AI Server",

        "classes": CLASS_NAMES,

        "threshold": (
            CONFIDENCE_THRESHOLD
        ),

        "hardware_mode": "gpio" if hardware.enabled else "simulated",

        "cooldown": COMMAND_COOLDOWN

    })


@app.route(
    "/firebase-status",
    methods=["GET"]
)
def firebase_connection_status():
    return jsonify(firebase_status())


@app.route(
    "/api/trash-level",
    methods=["GET", "POST"]
)
def api_trash_level():
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        saved = record_trash_level(data)
        return jsonify({"success": saved, "data": data})
    level_data = hardware.read_all_levels()
    saved = record_trash_level(level_data)
    return jsonify({"success": True, "saved_to_firestore": saved, "level": level_data})


@app.route(
    "/device-status",
    methods=["POST"]
)
def receive_device_status():
    if not ESP32_DEVICE_TOKEN:
        return jsonify({
            "ok": False,
            "error": "ESP32_DEVICE_TOKEN is not configured"
        }), 503

    supplied_token = request.headers.get("X-Device-Token", "")
    if not compare_digest(supplied_token, ESP32_DEVICE_TOKEN):
        return jsonify({"ok": False, "error": "Unauthorized device"}), 401

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Expected a JSON object"}), 400

    required = {"biodegradable", "recyclable", "residual"}
    if not required.issubset(payload):
        return jsonify({
            "ok": False,
            "error": "Missing one or more bin fill-level fields"
        }), 400

    firebase_saved = record_esp32_status({**payload, "source": "esp32"})
    if not firebase_saved:
        return jsonify({
            "ok": False,
            "error": "Could not save ESP32 status to Firestore"
        }), 503

    return jsonify({"ok": True, "firebase_saved": True})


# ============================================================
# HOME
# ============================================================

@app.route(
    "/",
    methods=["GET"]
)
def home():

    return jsonify({

        "name": "ECOBIN AI Server",

        "status": "running",

        "hardware_mode": "gpio" if hardware.enabled else "simulated"

    })


@app.route(
    "/api/status",
    methods=["GET"]
)
def api_status():
    return jsonify({
        "status": "online",
        "connected": True,
        "device": "Raspberry Pi",
        "hardware_mode": "gpio" if hardware.enabled else "simulated"
    })


def cleanup_session():
    try:
        record_esp32_session({"status": "offline", "connected": False, "device": "Raspberry Pi"})
    except Exception:
        pass


atexit.register(cleanup_session)
signal.signal(signal.SIGTERM, lambda s, f: (cleanup_session(), os._exit(0)))


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    init_hardware()

    print()
    print("=" * 60)
    print("ECOBIN AI SERVER IS READY")
    print("=" * 60)

    print()

    print("Server URL: http://0.0.0.0:5000")
    print("Hardware Mode:", "Raspberry Pi GPIO" if hardware.enabled else "Simulated")
    print("Camera -> AI -> Raspberry Pi GPIO -> Servo")
    print("=" * 60)
    print()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        use_reloader=False
    )
