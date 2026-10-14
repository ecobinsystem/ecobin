from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
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


def record_trash_level(data: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
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
