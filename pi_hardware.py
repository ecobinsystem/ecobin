from __future__ import annotations
import os
import threading
import time
from typing import Any, Callable

try:
    from gpiozero import AngularServo, Buzzer, DigitalInputDevice, DigitalOutputDevice
    _GPIO_AVAILABLE = True
except Exception:
    _GPIO_AVAILABLE = False

PIN_SERVO_BIO = int(os.getenv("PIN_SERVO_BIO", "17"))
PIN_SERVO_RECYCLE = int(os.getenv("PIN_SERVO_RECYCLE", "16"))
PIN_SERVO_RESIDUAL = int(os.getenv("PIN_SERVO_RESIDUAL", "26"))

PIN_TRIG_BIO = int(os.getenv("PIN_TRIG_BIO", "23"))
PIN_ECHO_BIO = int(os.getenv("PIN_ECHO_BIO", "24"))

PIN_TRIG_RECYCLE = int(os.getenv("PIN_TRIG_RECYCLE", "25"))
PIN_ECHO_RECYCLE = int(os.getenv("PIN_ECHO_RECYCLE", "27"))

PIN_TRIG_RESIDUAL = int(os.getenv("PIN_TRIG_RESIDUAL", "5"))
PIN_ECHO_RESIDUAL = int(os.getenv("PIN_ECHO_RESIDUAL", "6"))

PIN_BUZZER = int(os.getenv("PIN_BUZZER", "18"))

BIN_DEPTH_CM = float(os.getenv("BIN_DEPTH_CM", "30.0"))
BIN_EMPTY_CM = float(os.getenv("BIN_EMPTY_CM", "28.0"))
BIN_FULL_CM = float(os.getenv("BIN_FULL_CM", "5.0"))
SERVO_OPEN_SECONDS = float(os.getenv("SERVO_OPEN_SECONDS", "5.0"))

SERVO_CLOSED_ANGLE = 0
SERVO_OPEN_ANGLE = 80

class HardwareController:
    def __init__(self) -> None:
        self.enabled = False
        self.servos: dict[str, Any] = {}
        self.sensors: dict[str, Any] = {}
        self.buzzer: Any | None = None
        self._lock = threading.Lock()
        self._telemetry_thread: threading.Thread | None = None
        self._running = False
        self._on_level_callback: Callable[[dict[str, Any]], None] | None = None
        self.current_levels = {
            "biodegradable": 0,
            "recyclable": 0,
            "residual": 0,
        }

    def initialize(self) -> bool:
        if not _GPIO_AVAILABLE:
            print("GPIO libraries not available. Running in simulated hardware mode.")
            return False

        try:
            self.servos["biodegradable"] = AngularServo(
                PIN_SERVO_BIO,
                min_angle=0,
                max_angle=180,
                min_pulse_width=0.0005,
                max_pulse_width=0.0025,
            )
            self.servos["recyclable"] = AngularServo(
                PIN_SERVO_RECYCLE,
                min_angle=0,
                max_angle=180,
                min_pulse_width=0.0005,
                max_pulse_width=0.0025,
            )
            self.servos["residual"] = AngularServo(
                PIN_SERVO_RESIDUAL,
                min_angle=0,
                max_angle=180,
                min_pulse_width=0.0005,
                max_pulse_width=0.0025,
            )

            for servo in self.servos.values():
                servo.angle = SERVO_CLOSED_ANGLE
            time.sleep(0.5)
            for servo in self.servos.values():
                servo.detach()

            self.sensors["biodegradable"] = (
                DigitalOutputDevice(PIN_TRIG_BIO),
                DigitalInputDevice(PIN_ECHO_BIO, pull_up=False)
            )
            self.sensors["recyclable"] = (
                DigitalOutputDevice(PIN_TRIG_RECYCLE),
                DigitalInputDevice(PIN_ECHO_RECYCLE, pull_up=False)
            )
            self.sensors["residual"] = (
                DigitalOutputDevice(PIN_TRIG_RESIDUAL),
                DigitalInputDevice(PIN_ECHO_RESIDUAL, pull_up=False)
            )

            try:
                self.buzzer = Buzzer(PIN_BUZZER)
            except Exception:
                self.buzzer = None

            self.enabled = True
            print("Raspberry Pi GPIO hardware initialized successfully.")
            return True
        except Exception as e:
            print(f"Hardware init warning: {e}. Fallback to simulated mode.")
            self.enabled = False
            return False

    def beep(self, duration: float = 0.15) -> None:
        if not self.enabled or self.buzzer is None:
            return
        def _run_beep() -> None:
            try:
                self.buzzer.on()
                time.sleep(duration)
                self.buzzer.off()
            except Exception:
                pass
        threading.Thread(target=_run_beep, daemon=True).start()

    def open_lid(self, waste_type: str, hold_duration: float = SERVO_OPEN_SECONDS) -> dict[str, Any]:
        key = waste_type.strip().lower()
        if key not in {"biodegradable", "recyclable", "residual"}:
            return {"success": False, "sent": False, "message": f"Invalid waste type: {waste_type}"}

        self.beep(0.2)

        def _actuate() -> None:
            with self._lock:
                if self.enabled and key in self.servos:
                    try:
                        servo = self.servos[key]
                        servo.angle = SERVO_OPEN_ANGLE
                        time.sleep(0.7)
                        servo.detach()
                        time.sleep(max(0.0, hold_duration - 0.7))
                        servo.angle = SERVO_CLOSED_ANGLE
                        time.sleep(0.7)
                        servo.detach()
                    except Exception as err:
                        print(f"Error actuating servo for {key}: {err}")
                else:
                    print(f"[SIMULATED HARDWARE] Opened {key} lid for {hold_duration}s")
                    time.sleep(hold_duration)
                    print(f"[SIMULATED HARDWARE] Closed {key} lid")

        threading.Thread(target=_actuate, daemon=True).start()
        return {
            "success": True,
            "sent": True,
            "message": f"Opened {key} bin lid directly via Raspberry Pi GPIO",
            "hardware_mode": "gpio" if self.enabled else "simulated",
        }

    def _read_sensor_cm(self, key: str) -> float:
        if not self.enabled or key not in self.sensors:
            return BIN_EMPTY_CM
        try:
            trig, echo = self.sensors[key]
            trig.off()
            time.sleep(0.02)
            trig.on()
            time.sleep(0.00001)
            trig.off()

            start_wait = time.perf_counter()
            while not echo.is_active:
                if time.perf_counter() - start_wait > 0.03:
                    return BIN_EMPTY_CM

            pulse_start = time.perf_counter()
            while echo.is_active:
                if time.perf_counter() - pulse_start > 0.03:
                    return BIN_EMPTY_CM
            pulse_end = time.perf_counter()

            duration = pulse_end - pulse_start
            distance_cm = (duration * 34300.0) / 2.0
            return round(distance_cm, 1)
        except Exception:
            return BIN_EMPTY_CM

    def read_all_levels(self) -> dict[str, Any]:
        results: dict[str, Any] = {}
        for key in ("biodegradable", "recyclable", "residual"):
            dist_cm = self._read_sensor_cm(key)
            if dist_cm >= BIN_EMPTY_CM:
                pct = 0
            elif dist_cm <= BIN_FULL_CM:
                pct = 100
            else:
                pct = int(round(((BIN_EMPTY_CM - dist_cm) / (BIN_EMPTY_CM - BIN_FULL_CM)) * 100.0))
            pct = max(0, min(100, pct))
            results[key] = pct
            results[f"{key}_distance_cm"] = round(dist_cm, 1)

        self.current_levels["biodegradable"] = results["biodegradable"]
        self.current_levels["recyclable"] = results["recyclable"]
        self.current_levels["residual"] = results["residual"]
        return results

    def start_telemetry(self, interval: float = 10.0, callback: Callable[[dict[str, Any]], None] | None = None) -> None:
        if self._running:
            return
        self._running = True
        self._on_level_callback = callback

        def _telemetry_loop() -> None:
            while self._running:
                try:
                    levels = self.read_all_levels()
                    if self._on_level_callback:
                        self._on_level_callback(levels)
                except Exception as e:
                    print(f"Telemetry error: {e}")
                time.sleep(interval)

        self._telemetry_thread = threading.Thread(target=_telemetry_loop, daemon=True)
        self._telemetry_thread.start()

    def stop(self) -> None:
        self._running = False
        if self.enabled:
            for servo in self.servos.values():
                try:
                    servo.angle = SERVO_CLOSED_ANGLE
                    servo.close()
                except Exception:
                    pass
            for item in self.sensors.values():
                try:
                    if isinstance(item, tuple):
                        item[0].close()
                        item[1].close()
                    else:
                        item.close()
                except Exception:
                    pass
            if self.buzzer:
                try:
                    self.buzzer.close()
                except Exception:
                    pass

hardware = HardwareController()
