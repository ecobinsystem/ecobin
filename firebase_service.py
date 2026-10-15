from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
from typing import Any
import urllib.request

from env_loader import load_env_file


_database: Any | None = None
_mode: str = "none"
_rest_project_id: str = ""
_rest_api_key: str = ""
_status = "Firebase has not been configured."


def _to_firestore_value(val: Any) -> dict[str, Any]:
    if val is None:
        return {"nullValue": None}
    if isinstance(val, bool):
        return {"booleanValue": val}
    if isinstance(val, int):
        return {"integerValue": str(val)}
    if isinstance(val, float):
        return {"doubleValue": val}
    if isinstance(val, str):
        return {"stringValue": val}
    if isinstance(val, dict):
        return {"mapValue": {"fields": {k: _to_firestore_value(v) for k, v in val.items()}}}
    if isinstance(val, (list, tuple)):
        return {"arrayValue": {"values": [_to_firestore_value(v) for v in val]}}
    return {"stringValue": str(val)}


def _rest_add_document(collection: str, data: dict[str, Any]) -> bool:
    global _status
    try:
        url = f"https://firestore.googleapis.com/v1/projects/{_rest_project_id}/databases/(default)/documents/{collection}?key={_rest_api_key}"
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fields = {k: _to_firestore_value(v) for k, v in data.items() if k not in ("timestamp", "recorded_at")}
        fields["timestamp"] = {"timestampValue": now_iso}
        fields["recorded_at"] = {"stringValue": datetime.now(timezone.utc).isoformat()}
        body = json.dumps({"fields": fields}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        _status = f"Firestore REST write failed: {exc}"
        print(f"[Firebase REST Error] {exc}")
        return False


def _rest_set_document(collection: str, doc_id: str, data: dict[str, Any]) -> bool:
    global _status
    try:
        url = f"https://firestore.googleapis.com/v1/projects/{_rest_project_id}/databases/(default)/documents/{collection}/{doc_id}?key={_rest_api_key}"
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fields = {k: _to_firestore_value(v) for k, v in data.items() if k not in ("timestamp", "recorded_at")}
        fields["timestamp"] = {"timestampValue": now_iso}
        fields["recorded_at"] = {"stringValue": datetime.now(timezone.utc).isoformat()}
        body = json.dumps({"fields": fields}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PATCH")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        _status = f"Firestore REST write failed: {exc}"
        print(f"[Firebase REST Error] {exc}")
        return False


def initialize_firebase() -> bool:
    global _database, _status, _mode, _rest_project_id, _rest_api_key
    if _mode != "none":
        return True

    load_env_file(Path(__file__).resolve().parent / ".env")

    target_project = os.getenv("FIREBASE_PROJECT_ID", "").strip() or os.getenv("VITE_FIREBASE_PROJECT_ID", "").strip() or "ecobin-b4728"
    api_key = os.getenv("FIREBASE_API_KEY", "").strip() or os.getenv("VITE_FIREBASE_API_KEY", "").strip()

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    service_account_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip()
    if not service_account_json and not service_account_file:
        for candidate in Path(__file__).resolve().parent.glob("*firebase-adminsdk*.json"):
            service_account_file = str(candidate)
            break

    if service_account_file or service_account_json:
        try:
            parsed_project = ""
            if service_account_file:
                p = Path(service_account_file)
                if not p.is_absolute():
                    p = Path(__file__).resolve().parent / p
                if p.exists():
                    data = json.loads(p.read_text(encoding="utf-8"))
                    parsed_project = data.get("project_id", "")
            elif service_account_json:
                data = json.loads(service_account_json)
                parsed_project = data.get("project_id", "")

            if parsed_project and (not target_project or parsed_project == target_project):
                import firebase_admin
                from firebase_admin import credentials, firestore

                if not firebase_admin._apps:
                    if service_account_file:
                        credential_path = Path(service_account_file)
                        if not credential_path.is_absolute():
                            credential_path = Path(__file__).resolve().parent / credential_path
                        credential = credentials.Certificate(credential_path)
                    else:
                        credential = credentials.Certificate(json.loads(service_account_json))
                    firebase_admin.initialize_app(credential)
                _database = firestore.client()
                _mode = "admin"
                _status = "Connected to Cloud Firestore via Admin SDK."
                return True
        except Exception:
            pass

    if target_project and api_key:
        _rest_project_id = target_project
        _rest_api_key = api_key
        _mode = "rest"
        _status = f"Connected to Cloud Firestore ({target_project}) via REST API."
        return True

    _status = "Set FIREBASE_PROJECT_ID and FIREBASE_API_KEY or Service Account in .env."
    return False


def firebase_status() -> dict[str, Any]:
    return {"enabled": initialize_firebase(), "message": _status}


def record_classification(event: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
    payload = {
        **event,
        "Classification": event.get("waste_type", "unknown"),
    }
    if _mode == "rest":
        return _rest_add_document("waste_records", payload)
    try:
        from firebase_admin import firestore

        _database.collection("waste_records").add({
            **payload,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        return True
    except Exception as exc:
        global _status
        _status = f"Firebase write failed: {exc}"
        return False


def record_esp32_status(status: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
    if _mode == "rest":
        return _rest_set_document("esp32_status", "current", status)
    try:
        from firebase_admin import firestore

        _database.collection("esp32_status").document("current").set({
            **status,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        return True
    except Exception as exc:
        global _status
        _status = f"Firebase write failed: {exc}"
        return False


def record_esp32_session(session_data: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
    if _mode == "rest":
        return _rest_set_document("esp32_sessions", "current", session_data)
    try:
        from firebase_admin import firestore

        _database.collection("esp32_sessions").document("current").set({
            **session_data,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        return True
    except Exception as exc:
        global _status
        _status = f"Firebase write failed: {exc}"
        return False


_last_sms_sent: dict[str, float] = {}
_cached_pushbullet_device_key: str = ""


def get_pushbullet_device_key(token: str) -> str | None:
    global _cached_pushbullet_device_key
    if _cached_pushbullet_device_key:
        return _cached_pushbullet_device_key
    try:
        req = urllib.request.Request("https://api.pushbullet.com/v2/devices", headers={"Access-Token": token})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for dev in data.get("devices", []):
                if dev.get("has_sms") and dev.get("iden"):
                    _cached_pushbullet_device_key = dev["iden"]
                    return dev["iden"]
            devices = data.get("devices", [])
            if devices and devices[0].get("iden"):
                _cached_pushbullet_device_key = devices[0]["iden"]
                return devices[0]["iden"]
    except Exception:
        pass
    return None


def send_pushbullet_sms(phone: str, message: str) -> bool:
    token = os.getenv("VITE_PUSHBULLET_ACCESS_TOKEN", "").strip() or os.getenv("PUSHBULLET_ACCESS_TOKEN", "").strip()
    if not token or not phone:
        return False
    dev_key = get_pushbullet_device_key(token)
    if not dev_key:
        return False
    try:
        clean_phone = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
        if clean_phone.startswith("09"):
            clean_phone = "+63" + clean_phone[1:]
        elif clean_phone.startswith("639"):
            clean_phone = "+" + clean_phone
        elif not clean_phone.startswith("+"):
            clean_phone = "+63" + clean_phone

        url = "https://api.pushbullet.com/v2/texts"
        body = json.dumps({
            "data": {
                "addresses": [clean_phone],
                "message": message,
                "target_device_iden": dev_key
            }
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Access-Token": token, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"[Pushbullet Error] {exc}")
        return False


def get_recipients() -> list[dict[str, str]]:
    results = []
    if _mode == "rest" and _rest_project_id:
        try:
            url = f"https://firestore.googleapis.com/v1/projects/{_rest_project_id}/databases/(default)/documents/recipients?key={_rest_api_key}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for doc in data.get("documents", []):
                    fields = doc.get("fields", {})
                    name = fields.get("name", {}).get("stringValue", "")
                    contact = fields.get("contact", {}).get("stringValue", "") or fields.get("phone", {}).get("stringValue", "")
                    if contact:
                        results.append({"name": name, "contact": contact})
        except Exception:
            pass
    elif _mode == "admin" and _database:
        try:
            for doc in _database.collection("recipients").stream():
                data = doc.to_dict()
                name = data.get("name", "")
                contact = data.get("contact", "") or data.get("phone", "")
                if contact:
                    results.append({"name": name, "contact": contact})
        except Exception:
            pass
    return results


def check_and_notify_bin_levels(data: dict[str, Any]) -> None:
    now = time.time()
    for bin_key in ("biodegradable", "recyclable", "residual"):
        bin_data = data.get(bin_key)
        if not isinstance(bin_data, dict):
            continue
        fill = int(bin_data.get("fillPercentage", 0))
        status = str(bin_data.get("status", "NORMAL")).upper()
        if fill >= 80 or status in ("FULL", "WARNING", "NEARLY_FULL", "NEARLY FULL"):
            last_time = _last_sms_sent.get(bin_key, 0)
            if now - last_time < 300:
                continue
            _last_sms_sent[bin_key] = now
            dist = bin_data.get("distanceCm", "--")
            recips = get_recipients()
            current_status = "FULL" if fill >= 100 or status == "FULL" else "WARNING"
            bin_title = bin_key.capitalize()
            msg = f"EcoBin Alert: {bin_title} waste compartment is at {fill}% capacity ({dist} cm clearance). Status: {current_status}."
            recip_names = ", ".join(r["name"] for r in recips if r.get("name")) or "All Recipients"
            recip_contacts = ", ".join(r["contact"] for r in recips if r.get("contact"))
            for r in recips:
                phone = r.get("contact")
                if phone:
                    ok = send_pushbullet_sms(phone, msg)
                    print(f"[SMS Alert] {bin_title} ({fill}%): sent to {phone} - {'SUCCESS' if ok else 'FAILED'}")
            notif_doc = {
                "binName": bin_title,
                "fillPercentage": fill,
                "distanceCm": str(dist),
                "status": current_status,
                "recipientName": recip_names,
                "recipientContact": recip_contacts,
                "recipients": recips,
                "deviceIp": "Raspberry Pi",
            }
            if _mode == "rest":
                _rest_add_document("notifications", notif_doc)
            elif _mode == "admin" and _database:
                try:
                    from firebase_admin import firestore
                    _database.collection("notifications").add({
                        **notif_doc,
                        "createdAt": firestore.SERVER_TIMESTAMP,
                    })
                except Exception:
                    pass


def record_trash_level(data: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
    record_esp32_session({"status": "online", "connected": True, "device": "Raspberry Pi"})
    check_and_notify_bin_levels(data)
    if _mode == "rest":
        return _rest_add_document("trash_records", data)
    try:
        from firebase_admin import firestore

        _database.collection("trash_records").add({
            **data,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        return True
    except Exception as exc:
        global _status
        _status = f"Firebase write failed: {exc}"
        print(f"[Firebase Error] {exc}")
        return False
