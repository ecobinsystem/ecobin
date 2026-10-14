from __future__ import annotations
import time
from gpiozero import AngularServo

PIN_BIO = 17
PIN_RECYCLE = 16
PIN_RESIDUAL = 26

def reset_servos_to_zero():
    print("Connecting to servos on GPIO 17, 16, 26...")
    try:
        s_bio = AngularServo(
            PIN_BIO,
            min_angle=0,
            max_angle=180,
            min_pulse_width=0.0005,
            max_pulse_width=0.0025
        )
        s_rec = AngularServo(
            PIN_RECYCLE,
            min_angle=0,
            max_angle=180,
            min_pulse_width=0.0005,
            max_pulse_width=0.0025
        )
        s_res = AngularServo(
            PIN_RESIDUAL,
            min_angle=0,
            max_angle=180,
            min_pulse_width=0.0005,
            max_pulse_width=0.0025
        )

        s_bio.angle = 0
        s_rec.angle = 0
        s_res.angle = 0 

        print("All 3 servos are now locked at 0 degrees.")
        print("You can attach your servo arms/horns now.")
        print("Holding position for 10 seconds...")
        time.sleep(10)

        s_bio.detach()
        s_rec.detach()
        s_res.detach()
        print("Servos detached safely. Calibration complete.")
    except Exception as e:
        print(f"Error running servo zeroing: {e}")

if __name__ == "__main__":
    reset_servos_to_zero()
