import time
import cv2
import numpy as np
from flask import Flask, Response

app = Flask(__name__)
trigger_recalibrate = False

def get_camera():
    backends = [cv2.CAP_V4L2, cv2.CAP_ANY] if hasattr(cv2, "CAP_V4L2") else [cv2.CAP_ANY]
    for idx in (0, 1, 2, -1):
        for b in backends:
            try:
                cap = cv2.VideoCapture(idx, b)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    for _ in range(10):
                        time.sleep(0.05)
                        ret, test_frame = cap.read()
                        if ret and test_frame is not None:
                            return cap
                    cap.release()
            except Exception:
                pass
    return None

def generate_frames():
    global trigger_recalibrate
    cap = get_camera()
    if cap is None:
        return
    ROI_X1, ROI_Y1, ROI_X2, ROI_Y2 = 60, 30, 580, 450
    avg_bg = None
    bg_warmup = 45
    try:
        while True:
            if trigger_recalibrate:
                avg_bg = None
                bg_warmup = 35
                trigger_recalibrate = False

            success, frame = cap.read()
            if not success or frame is None:
                time.sleep(0.05)
                continue
            roi = frame[ROI_Y1:ROI_Y2, ROI_X1:ROI_X2]
            gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            gray_roi = cv2.GaussianBlur(gray_roi, (21, 21), 0)
            if avg_bg is None or bg_warmup > 0:
                if avg_bg is None:
                    avg_bg = gray_roi.copy().astype("float")
                else:
                    cv2.accumulateWeighted(gray_roi, avg_bg, 0.2)
                bg_warmup -= 1
                box_color = (0, 165, 255)
                status_text = "Calibrating camera..."
            else:
                diff = cv2.absdiff(gray_roi, cv2.convertScaleAbs(avg_bg))
                _, thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
                thresh = cv2.dilate(thresh, None, iterations=2)

                total_motion_pixels = np.count_nonzero(thresh)

                if total_motion_pixels >= 4000:
                    box_color = (0, 255, 0)
                    status_text = "Object detected - ready to scan"
                else:
                    box_color = (0, 165, 255)
                    status_text = "Ready - hold object here"
                    cv2.accumulateWeighted(gray_roi, avg_bg, 0.05)

            cv2.rectangle(frame, (ROI_X1, ROI_Y1), (ROI_X2, ROI_Y2), box_color, 2)
            cv2.putText(
                frame,
                "TARGET: " + status_text,
                (ROI_X1 + 10, max(20, ROI_Y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                box_color,
                2
            )
            ret, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
            if not ret:
                continue
            frame_bytes = buffer.tobytes()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
    finally:
        cap.release()

@app.route("/")
def index():
    return (
        "<!DOCTYPE html>"
        "<html>"
        "<head>"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
        "<title>EcoBin Camera Live Stream</title>"
        "<style>"
        "body{margin:0;padding:20px;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;text-align:center;}"
        "h1{margin:0 0 8px 0;font-size:24px;color:#22c55e;}"
        "p{margin:0 0 16px 0;color:#94a3b8;font-size:14px;}"
        ".feed-container{background:#1e293b;padding:12px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid #334155;margin-bottom:16px;}"
        "img{max-width:100%;height:auto;border-radius:10px;display:block;}"
        ".btn{background:#22c55e;color:#0f172a;font-weight:700;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer;}"
        ".btn:hover{background:#16a34a;}"
        "</style>"
        "</head>"
        "<body>"
        "<h1>EcoBin Live Camera Feed</h1>"
        "<p>Hold waste inside the target area &bull; Green box isolates the waste</p>"
        "<div class=\"feed-container\">"
        "<img src=\"/video_feed\" alt=\"Live Video Feed\" />"
        "</div>"
        "<button class=\"btn\" onclick=\"fetch('/recalibrate').then(()=>alert('Background recalibrating... please hold still for 1 second.'))\">Recalibrate Background</button>"
        "</body>"
        "</html>"
    )

@app.route("/recalibrate")
def recalibrate():
    global trigger_recalibrate
    trigger_recalibrate = True
    return "OK"

@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, threaded=True)
