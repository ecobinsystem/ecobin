from __future__ import annotations
import sys
import time
from gpiozero import DigitalInputDevice, DigitalOutputDevice

SENSORS = {
    "Biodegradable": {"trigger": 5, "echo": 6},
    "Recyclable": {"trigger": 25, "echo": 27},
    "Residual": {"trigger": 23, "echo": 24},
}

def measure_distance(trig: DigitalOutputDevice, echo: DigitalInputDevice) -> float | None:
    trig.off()
    time.sleep(0.03)

    trig.on()
    time.sleep(0.00001)
    trig.off()

    start_wait = time.perf_counter()
    while not echo.is_active:
        if time.perf_counter() - start_wait > 0.03:
            return None

    pulse_start = time.perf_counter()
    while echo.is_active:
        if time.perf_counter() - pulse_start > 0.03:
            return None
    pulse_end = time.perf_counter()

    duration = pulse_end - pulse_start
    distance_cm = (duration * 34300) / 2.0
    return round(distance_cm, 1)

def main():
    devices = {}
    for name, pins in SENSORS.items():
        try:
            trig = DigitalOutputDevice(pins["trigger"])
            echo = DigitalInputDevice(pins["echo"], pull_up=False)
            devices[name] = (trig, echo)
            print(f"Initialized {name} (TRIG: {pins['trigger']}, ECHO: {pins['echo']})")
        except Exception as e:
            print(f"Failed to setup {name}: {e}")

    if not devices:
        print("No devices could be setup.")
        sys.exit(1)

    print("\nReading distances... Press Ctrl+C to exit.\n")
    try:
        while True:
            parts = []
            for name, (trig, echo) in devices.items():
                dist = measure_distance(trig, echo)
                if dist is not None:
                    parts.append(f"{name}: {dist} cm")
                else:
                    parts.append(f"{name}: No echo")
            print(" | ".join(parts))
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nTest stopped.")
    finally:
        for trig, echo in devices.values():
            trig.close()
            echo.close()

if __name__ == "__main__":
    main()
