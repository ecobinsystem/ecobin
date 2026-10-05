from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from env_loader import load_env_file


_database: Any | None = None
_status = "Firebase has not been configured."


def initialize_firebase() -> bool:
    global _database, _status
    if _database is not None:
        return True

    load_env_file(Path(__file__).resolve().parent / ".env")

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    service_account_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip()
    if not service_account_json and not service_account_file:
        for candidate in Path(__file__).resolve().parent.glob("*firebase-adminsdk*.json"):
            service_account_file = str(candidate)
            break

    if not service_account_json and not service_account_file:
        _status = (
            "Set either FIREBASE_SERVICE_ACCOUNT_FILE or "
            "FIREBASE_SERVICE_ACCOUNT_JSON in .env."
        )
        return False

    try:
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
        _status = "Connected to Cloud Firestore."
        return True
    except Exception as exc:
        _status = f"Firebase is unavailable: {exc}"
        return False


def firebase_status() -> dict[str, Any]:
    return {"enabled": initialize_firebase(), "message": _status}


def record_classification(event: dict[str, Any]) -> bool:
    if not initialize_firebase():
        return False
    try:
        from firebase_admin import firestore

        _database.collection("waste_records").add({
            **event,
            "Classification": event["waste_type"],
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
        return False
