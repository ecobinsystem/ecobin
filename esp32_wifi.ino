/*
 * ==============================================================================
 * EcoBin ESP32 Wi-Fi Connection & Web Serial Monitor Server
 * ==============================================================================
 * Features:
 *  - Wi-Fi Station connection with auto-reconnect watchdog
 *  - REST API (/api/status, /api/logs, /api/command) with full CORS support
 *  - Hardware Serial Monitor (115200 baud) with interactive command parser
 *  - Ring buffer for wireless web log streaming
 *  - Web Serial API compatible
 * 
 * Target Board: ESP32 Dev Module / NodeMCU-32S / ESP32-WROOM
 * Libraries Required: Built-in Arduino ESP32 core (WiFi.h, WebServer.h)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// -----------------------------------------------------------------------------
// Configuration: Replace with your Wi-Fi credentials
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "aycee";
const char* WIFI_PASSWORD = "abcde123";

// Hardware Configuration
const int STATUS_LED_PIN = 2; // Onboard LED on most ESP32 boards (GPIO 2)
const int SERVO_BIO_PIN = 13;
const int SERVO_REC_PIN = 14;
const int SERVO_RES_PIN = 27;
const int SERVO_CLOSED_ANGLE = 180;
const int SERVO_OPEN_ANGLE = 0;
const unsigned long SERVO_OPEN_DURATION_MS = 8000;

const int TRIG_BIO_PIN = 5;
const int ECHO_BIO_PIN = 18;
const int TRIG_REC_PIN = 19;
const int ECHO_REC_PIN = 21;
const int TRIG_RES_PIN = 22;
const int ECHO_RES_PIN = 23;
const float BIN_DEPTH_CM = 25.0;
const char* FIREBASE_PROJECT_ID = "ecobin-b4728";
const char* FIREBASE_API_KEY = "AIzaSyAu5OJmQipn70ptSXo69ekNLLJQqSoIskY";

Servo servoBio;
Servo servoRec;
Servo servoRes;

unsigned long servoCloseTime = 0;
bool isServoOpen = false;

// Web Server instance on port 80
WebServer server(80);

// -----------------------------------------------------------------------------
// In-Memory Log Ring Buffer for Wireless Serial Monitoring
// -----------------------------------------------------------------------------
const int MAX_LOG_LINES = 60;
String logBuffer[MAX_LOG_LINES];
int logHead = 0;
int totalLogs = 0;

void addLogToBuffer(const String& line) {
  logBuffer[logHead] = line;
  logHead = (logHead + 1) % MAX_LOG_LINES;
  if (totalLogs < MAX_LOG_LINES) {
    totalLogs++;
  }
}

// Unified logging that outputs to both Hardware Serial and RAM buffer
void logMsg(const String& msg, bool newline = true) {
  if (newline) {
    Serial.println(msg);
  } else {
    Serial.print(msg);
  }
  addLogToBuffer(msg);
}

float measureDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) {
    return -1.0;
  }
  return (duration * 0.0343) / 2.0;
}

float calculateFillPercentage(float distance) {
  if (distance < 0) return 0.0;
  if (distance >= (BIN_DEPTH_CM - 1.5)) return 0.0;
  if (distance > BIN_DEPTH_CM) distance = BIN_DEPTH_CM;
  if (distance <= 5.0) return 100.0;
  float filled = BIN_DEPTH_CM - distance;
  float pct = (filled / (BIN_DEPTH_CM - 5.0)) * 100.0;
  if (pct < 0.0) return 0.0;
  if (pct > 100.0) return 100.0;
  return pct;
}

void sendTrashLevelToFirestore() {
  if (WiFi.status() != WL_CONNECTED) return;

  float distBio = measureDistance(TRIG_BIO_PIN, ECHO_BIO_PIN);
  delay(20);
  float distRec = measureDistance(TRIG_REC_PIN, ECHO_REC_PIN);
  delay(20);
  float distRes = measureDistance(TRIG_RES_PIN, ECHO_RES_PIN);

  float fillBio = calculateFillPercentage(distBio);
  float fillRec = calculateFillPercentage(distRec);
  float fillRes = calculateFillPercentage(distRes);

  String statusBio = (fillBio >= 100.0) ? "FULL" : ((fillBio >= 90.0) ? "NEARLY_FULL" : ((fillBio >= 80.0) ? "WARNING" : ((fillBio >= 50.0) ? "HALF_FULL" : "LOW")));
  String statusRec = (fillRec >= 100.0) ? "FULL" : ((fillRec >= 90.0) ? "NEARLY_FULL" : ((fillRec >= 80.0) ? "WARNING" : ((fillRec >= 50.0) ? "HALF_FULL" : "LOW")));
  String statusRes = (fillRes >= 100.0) ? "FULL" : ((fillRes >= 90.0) ? "NEARLY_FULL" : ((fillRes >= 80.0) ? "WARNING" : ((fillRes >= 50.0) ? "HALF_FULL" : "LOW")));

  logMsg("[ULTRASONIC] Bio: " + String(fillBio, 0) + "% (" + statusBio + ") | Rec: " + String(fillRec, 0) + "% (" + statusRec + ") | Res: " + String(fillRes, 0) + "% (" + statusRes + ")");

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://firestore.googleapis.com/v1/projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/trash_records?key=" + String(FIREBASE_API_KEY);

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    String json = "{\"fields\":{";
    json += "\"biodegradable\":{\"mapValue\":{\"fields\":{";
    json += "\"distanceCm\":{\"doubleValue\":" + String(distBio, 1) + "},";
    json += "\"fillPercentage\":{\"doubleValue\":" + String(fillBio, 1) + "},";
    json += "\"status\":{\"stringValue\":\"" + statusBio + "\"}";
    json += "}}},";

    json += "\"recyclable\":{\"mapValue\":{\"fields\":{";
    json += "\"distanceCm\":{\"doubleValue\":" + String(distRec, 1) + "},";
    json += "\"fillPercentage\":{\"doubleValue\":" + String(fillRec, 1) + "},";
    json += "\"status\":{\"stringValue\":\"" + statusRec + "\"}";
    json += "}}},";

    json += "\"residual\":{\"mapValue\":{\"fields\":{";
    json += "\"distanceCm\":{\"doubleValue\":" + String(distRes, 1) + "},";
    json += "\"fillPercentage\":{\"doubleValue\":" + String(fillRes, 1) + "},";
    json += "\"status\":{\"stringValue\":\"" + statusRes + "\"}";
    json += "}}},";

    json += "\"deviceIp\":{\"stringValue\":\"" + WiFi.localIP().toString() + "\"}";
    json += "}}";

    int httpCode = https.POST(json);
    if (httpCode >= 200 && httpCode < 300) {
      logMsg("[FIRESTORE] 3-Bin levels saved successfully (HTTP " + String(httpCode) + ")");
    } else {
      logMsg("[FIRESTORE] Save failed (HTTP " + String(httpCode) + ")");
    }
    https.end();
  }
}

void sendSessionToFirestore(String status) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://firestore.googleapis.com/v1/projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/esp32_sessions/current?key=" + String(FIREBASE_API_KEY);

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    String json = "{\"fields\":{";
    json += "\"status\":{\"stringValue\":\"" + status + "\"},";
    json += "\"connected\":{\"booleanValue\":" + String(status == "online" ? "true" : "false") + "},";
    json += "\"ip\":{\"stringValue\":\"" + WiFi.localIP().toString() + "\"},";
    json += "\"recorded_at\":{\"stringValue\":\"" + String(millis()) + "\"}";
    json += "}}";

    https.sendRequest("PATCH", json);
    https.end();
  }
}

// -----------------------------------------------------------------------------
// CORS Helper: Allows index.html to fetch status even when opened locally
// -----------------------------------------------------------------------------
void sendCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// -----------------------------------------------------------------------------
// Serial Command Processor
// Executes commands whether sent via USB Serial or via Web REST API
// -----------------------------------------------------------------------------
String processCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return "";

  logMsg("> Executing: " + cmd);

  if (cmd.equalsIgnoreCase("help")) {
    String helpText = "Available Commands:\n";
    helpText += "  status    - Print Wi-Fi connection, IP, RSSI, and Uptime\n";
    helpText += "  ping      - Check ESP32 responsiveness\n";
    helpText += "  scan      - Scan for visible Wi-Fi networks\n";
    helpText += "  led on    - Turn on onboard LED\n";
    helpText += "  led off   - Turn off onboard LED\n";
    helpText += "  heap      - Display free memory heap\n";
    helpText += "  reboot    - Restart the ESP32";
    logMsg(helpText);
    return helpText;
  }
  else if (cmd.equalsIgnoreCase("status")) {
    String stat = "[STATUS] Wi-Fi: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
    stat += " | SSID: " + WiFi.SSID();
    stat += " | IP: " + WiFi.localIP().toString();
    stat += " | RSSI: " + String(WiFi.RSSI()) + " dBm";
    stat += " | Uptime: " + String(millis() / 1000) + "s";
    logMsg(stat);
    return stat;
  }
  else if (cmd.equalsIgnoreCase("ping")) {
    logMsg("[PONG] ESP32 is online and responding! (millis: " + String(millis()) + ")");
    return "PONG: online";
  }
  else if (cmd.equalsIgnoreCase("heap")) {
    String heap = "[INFO] Free Heap: " + String(ESP.getFreeHeap()) + " bytes";
    logMsg(heap);
    return heap;
  }
  else if (cmd.equalsIgnoreCase("led on")) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    logMsg("[HARDWARE] Onboard LED turned ON");
    return "LED ON";
  }
  else if (cmd.equalsIgnoreCase("led off")) {
    digitalWrite(STATUS_LED_PIN, LOW);
    logMsg("[HARDWARE] Onboard LED turned OFF");
    return "LED OFF";
  }
  else if (cmd.equalsIgnoreCase("scan")) {
    logMsg("[WIFI] Scanning visible networks...");
    int n = WiFi.scanNetworks();
    String scanResult = "[WIFI] Found " + String(n) + " networks:\n";
    for (int i = 0; i < n; ++i) {
      scanResult += "  [" + String(i + 1) + "] " + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)\n";
    }
    logMsg(scanResult);
    return scanResult;
  }
  else if (cmd.equalsIgnoreCase("reboot") || cmd.equalsIgnoreCase("restart")) {
    logMsg("[SYSTEM] Rebooting ESP32 in 1 second...");
    delay(1000);
    ESP.restart();
    return "Rebooting...";
  }
  else if (cmd.equalsIgnoreCase("biodegradable") || cmd.equalsIgnoreCase("bio")) {
    servoRec.write(SERVO_CLOSED_ANGLE);
    servoRes.write(SERVO_CLOSED_ANGLE);
    servoBio.write(SERVO_OPEN_ANGLE);
    servoCloseTime = millis() + SERVO_OPEN_DURATION_MS;
    isServoOpen = true;
    logMsg("[SERVO] Opened BIODEGRADABLE bin (GPIO 13)");
    logMsg("[CLASSIFY] Waste detected: BIODEGRADABLE");
    return "OK: BIODEGRADABLE";
  }
  else if (cmd.equalsIgnoreCase("recyclable") || cmd.equalsIgnoreCase("rec")) {
    servoBio.write(SERVO_CLOSED_ANGLE);
    servoRes.write(SERVO_CLOSED_ANGLE);
    servoRec.write(SERVO_OPEN_ANGLE);
    servoCloseTime = millis() + SERVO_OPEN_DURATION_MS;
    isServoOpen = true;
    logMsg("[SERVO] Opened RECYCLABLE bin (GPIO 14)");
    logMsg("[CLASSIFY] Waste detected: RECYCLABLE");
    return "OK: RECYCLABLE";
  }
  else if (cmd.equalsIgnoreCase("residual") || cmd.equalsIgnoreCase("res")) {
    servoBio.write(SERVO_CLOSED_ANGLE);
    servoRec.write(SERVO_CLOSED_ANGLE);
    servoRes.write(SERVO_OPEN_ANGLE);
    servoCloseTime = millis() + SERVO_OPEN_DURATION_MS;
    isServoOpen = true;
    logMsg("[SERVO] Opened RESIDUAL bin (GPIO 27)");
    logMsg("[CLASSIFY] Waste detected: RESIDUAL");
    return "OK: RESIDUAL";
  }
  else if (cmd.equalsIgnoreCase("close") || cmd.equalsIgnoreCase("servo close")) {
    servoBio.write(SERVO_CLOSED_ANGLE);
    servoRec.write(SERVO_CLOSED_ANGLE);
    servoRes.write(SERVO_CLOSED_ANGLE);
    isServoOpen = false;
    logMsg("[SERVO] All bins closed");
    return "OK: ALL CLOSED";
  }
  else if (cmd.equalsIgnoreCase("level") || cmd.equalsIgnoreCase("trash level")) {
    float distBio = measureDistance(TRIG_BIO_PIN, ECHO_BIO_PIN);
    delay(20);
    float distRec = measureDistance(TRIG_REC_PIN, ECHO_REC_PIN);
    delay(20);
    float distRes = measureDistance(TRIG_RES_PIN, ECHO_RES_PIN);

    float fillBio = calculateFillPercentage(distBio);
    float fillRec = calculateFillPercentage(distRec);
    float fillRes = calculateFillPercentage(distRes);

    String res = "[LEVELS] Bio: " + String(fillBio, 0) + "% | Rec: " + String(fillRec, 0) + "% | Res: " + String(fillRes, 0) + "%";
    logMsg(res);
    sendTrashLevelToFirestore();
    return res;
  }
  else {
    String unknown = "[ERROR] Unknown command: '" + cmd + "'. Type 'help' for command list.";
    logMsg(unknown);
    return unknown;
  }
}

// -----------------------------------------------------------------------------
// Route: Root ("/")
// -----------------------------------------------------------------------------
void handleRoot() {
  sendCORSHeaders();
  
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>EcoBin ESP32 Server</title>";
  html += "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
  html += "background:#0a0f18;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;}";
  html += ".card{background:rgba(18,26,43,0.85);border:1px solid rgba(255,255,255,0.15);padding:2.5rem;border-radius:20px;max-width:480px;text-align:center;box-shadow:0 15px 35px rgba(0,0,0,0.5);}";
  html += "h1{color:#10b981;margin-bottom:0.5rem;}p{color:#94a3b8;line-height:1.6;}";
  html += ".btn{display:inline-block;margin:0.5rem;background:#10b981;color:#fff;text-decoration:none;padding:0.75rem 1.25rem;border-radius:10px;font-weight:600;}";
  html += "</style></head><body>";
  html += "<div class='card'>";
  html += "<h1>EcoBin ESP32 Online</h1>";
  html += "<p>Connected to Wi-Fi: <strong>" + WiFi.SSID() + "</strong></p>";
  html += "<p>Device IP: <strong>" + WiFi.localIP().toString() + "</strong></p>";
  html += "<p>Signal (RSSI): <strong>" + String(WiFi.RSSI()) + " dBm</strong></p>";
  html += "<a class='btn' href='/api/status'>Status JSON</a>";
  html += "<a class='btn' href='/api/logs'>Serial Logs</a>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
}

// -----------------------------------------------------------------------------
// Route: JSON Status API ("/api/status")
// -----------------------------------------------------------------------------
void handleStatus() {
  sendCORSHeaders();

  bool isConnected = (WiFi.status() == WL_CONNECTED);
  float distBio = measureDistance(TRIG_BIO_PIN, ECHO_BIO_PIN);
  delay(20);
  float distRec = measureDistance(TRIG_REC_PIN, ECHO_REC_PIN);
  delay(20);
  float distRes = measureDistance(TRIG_RES_PIN, ECHO_RES_PIN);

  float fillBio = calculateFillPercentage(distBio);
  float fillRec = calculateFillPercentage(distRec);
  float fillRes = calculateFillPercentage(distRes);
  
  String json = "{";
  json += "\"status\":\"" + String(isConnected ? "connected" : "disconnected") + "\",";
  json += "\"connected\":" + String(isConnected ? "true" : "false") + ",";
  json += "\"ssid\":\"" + (isConnected ? WiFi.SSID() : "") + "\",";
  json += "\"ip\":\"" + (isConnected ? WiFi.localIP().toString() : "0.0.0.0") + "\",";
  json += "\"rssi\":" + String(isConnected ? WiFi.RSSI() : 0) + ",";
  json += "\"mac\":\"" + WiFi.macAddress() + "\",";
  json += "\"uptime\":" + String(millis() / 1000) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"bioDistanceCm\":" + String(distBio, 1) + ",";
  json += "\"bioFillPercentage\":" + String(fillBio, 1) + ",";
  json += "\"recDistanceCm\":" + String(distRec, 1) + ",";
  json += "\"recFillPercentage\":" + String(fillRec, 1) + ",";
  json += "\"resDistanceCm\":" + String(distRes, 1) + ",";
  json += "\"resFillPercentage\":" + String(fillRes, 1) + ",";
  json += "\"chipId\":\"" + String((uint32_t)ESP.getEfuseMac(), HEX) + "\"";
  json += "}";

  server.send(200, "application/json", json);
}

void handleLevel() {
  sendCORSHeaders();
  float distBio = measureDistance(TRIG_BIO_PIN, ECHO_BIO_PIN);
  delay(20);
  float distRec = measureDistance(TRIG_REC_PIN, ECHO_REC_PIN);
  delay(20);
  float distRes = measureDistance(TRIG_RES_PIN, ECHO_RES_PIN);

  float fillBio = calculateFillPercentage(distBio);
  float fillRec = calculateFillPercentage(distRec);
  float fillRes = calculateFillPercentage(distRes);

  String statusBio = (fillBio >= 100.0) ? "FULL" : ((fillBio >= 90.0) ? "NEARLY_FULL" : ((fillBio >= 80.0) ? "WARNING" : ((fillBio >= 50.0) ? "HALF_FULL" : "LOW")));
  String statusRec = (fillRec >= 100.0) ? "FULL" : ((fillRec >= 90.0) ? "NEARLY_FULL" : ((fillRec >= 80.0) ? "WARNING" : ((fillRec >= 50.0) ? "HALF_FULL" : "LOW")));
  String statusRes = (fillRes >= 100.0) ? "FULL" : ((fillRes >= 90.0) ? "NEARLY_FULL" : ((fillRes >= 80.0) ? "WARNING" : ((fillRes >= 50.0) ? "HALF_FULL" : "LOW")));

  String json = "{";
  json += "\"biodegradable\":{\"distanceCm\":" + String(distBio, 1) + ",\"fillPercentage\":" + String(fillBio, 1) + ",\"status\":\"" + statusBio + "\"},";
  json += "\"recyclable\":{\"distanceCm\":" + String(distRec, 1) + ",\"fillPercentage\":" + String(fillRec, 1) + ",\"status\":\"" + statusRec + "\"},";
  json += "\"residual\":{\"distanceCm\":" + String(distRes, 1) + ",\"fillPercentage\":" + String(fillRes, 1) + ",\"status\":\"" + statusRes + "\"}";
  json += "}";

  server.send(200, "application/json", json);
}

// -----------------------------------------------------------------------------
// Route: Wi-Fi Serial Logs API ("/api/logs")
// Delivers recent log messages buffered in memory
// -----------------------------------------------------------------------------
void handleLogs() {
  sendCORSHeaders();

  String json = "{\"logs\":[";
  int startIdx = (totalLogs < MAX_LOG_LINES) ? 0 : logHead;
  bool first = true;

  for (int i = 0; i < totalLogs; i++) {
    int idx = (startIdx + i) % MAX_LOG_LINES;
    if (!first) json += ",";
    
    // Escape quotes and backslashes for JSON safety
    String safeMsg = logBuffer[idx];
    safeMsg.replace("\\", "\\\\");
    safeMsg.replace("\"", "\\\"");
    safeMsg.replace("\n", " ");
    safeMsg.replace("\r", "");
    
    json += "\"" + safeMsg + "\"";
    first = false;
  }
  json += "],\"total\":" + String(totalLogs) + "}";

  server.send(200, "application/json", json);
}

// -----------------------------------------------------------------------------
// Route: Command API ("/api/command")
// Accepts GET (?cmd=...) or POST (plain text or form body)
// -----------------------------------------------------------------------------
void handleCommand() {
  sendCORSHeaders();

  String cmd = "";
  if (server.hasArg("cmd")) {
    cmd = server.arg("cmd");
  } else if (server.hasArg("plain")) {
    cmd = server.arg("plain");
  }

  String reply = processCommand(cmd);

  String json = "{";
  json += "\"command\":\"" + cmd + "\",";
  json += "\"response\":\"" + reply + "\"";
  json += "}";

  server.send(200, "application/json", json);
}

void handleClassify() {
  sendCORSHeaders();
  String wasteType = "";
  if (server.hasArg("type")) {
    wasteType = server.arg("type");
  } else if (server.hasArg("cmd")) {
    wasteType = server.arg("cmd");
  } else if (server.hasArg("plain")) {
    wasteType = server.arg("plain");
  }
  wasteType.trim();
  String reply = processCommand(wasteType);
  server.send(200, "application/json", "{\"status\":\"ok\",\"type\":\"" + wasteType + "\",\"response\":\"" + reply + "\"}");
}

// -----------------------------------------------------------------------------
// Route: Preflight OPTIONS
// -----------------------------------------------------------------------------
void handleOptions() {
  sendCORSHeaders();
  server.send(204);
}

// -----------------------------------------------------------------------------
// Route: 404
// -----------------------------------------------------------------------------
void handleNotFound() {
  sendCORSHeaders();
  server.send(404, "application/json", "{\"error\":\"Not Found\"}");
}

// -----------------------------------------------------------------------------
// Arduino Setup
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  pinMode(TRIG_BIO_PIN, OUTPUT);
  pinMode(ECHO_BIO_PIN, INPUT);
  digitalWrite(TRIG_BIO_PIN, LOW);

  pinMode(TRIG_REC_PIN, OUTPUT);
  pinMode(ECHO_REC_PIN, INPUT);
  digitalWrite(TRIG_REC_PIN, LOW);

  pinMode(TRIG_RES_PIN, OUTPUT);
  pinMode(ECHO_RES_PIN, INPUT);
  digitalWrite(TRIG_RES_PIN, LOW);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servoBio.setPeriodHertz(50);
  servoRec.setPeriodHertz(50);
  servoRes.setPeriodHertz(50);

  servoBio.attach(SERVO_BIO_PIN, 500, 2400);
  servoRec.attach(SERVO_REC_PIN, 500, 2400);
  servoRes.attach(SERVO_RES_PIN, 500, 2400);

  servoBio.write(SERVO_CLOSED_ANGLE);
  servoRec.write(SERVO_CLOSED_ANGLE);
  servoRes.write(SERVO_CLOSED_ANGLE);

  logMsg("\n==========================================");
  logMsg("  EcoBin ESP32 Wi-Fi & Serial Monitor Core");
  logMsg("==========================================");
  logMsg("Baud Rate: 115200 bps");
  logMsg("Connecting to Wi-Fi SSID: " + String(WIFI_SSID));

  // Set Wi-Fi station mode
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Connection loop with visual blink
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    logMsg("[SUCCESS] Wi-Fi Connected!");
    logMsg("[INFO] Assigned IP: " + WiFi.localIP().toString());
    logMsg("[INFO] Signal Strength: " + String(WiFi.RSSI()) + " dBm");
    logMsg("[INFO] MAC Address: " + WiFi.macAddress());
    sendSessionToFirestore("online");
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
    logMsg("[WARNING] Could not connect to Wi-Fi. Check SSID/Password.");
  }

  // Register HTTP Routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/api/logs", HTTP_GET, handleLogs);
  server.on("/api/logs", HTTP_OPTIONS, handleOptions);
  server.on("/api/command", HTTP_GET, handleCommand);
  server.on("/api/command", HTTP_POST, handleCommand);
  server.on("/api/command", HTTP_OPTIONS, handleOptions);
  server.on("/classify", HTTP_GET, handleClassify);
  server.on("/classify", HTTP_POST, handleClassify);
  server.on("/classify", HTTP_OPTIONS, handleOptions);
  server.on("/api/level", HTTP_GET, handleLevel);
  server.on("/api/level", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);

  // Start Web Server
  server.begin();
  logMsg("[SERVER] HTTP Server listening on port 80");
  logMsg("[INFO] Type 'help' in Serial Monitor or Web Dashboard for commands.");
  logMsg("==========================================\n");
}

// -----------------------------------------------------------------------------
// Arduino Main Loop
// -----------------------------------------------------------------------------
void loop() {
  // Handle HTTP clients
  server.handleClient();

  // Read Hardware Serial input from USB
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      processCommand(input);
    }
  }

  if (isServoOpen && millis() >= servoCloseTime) {
    servoBio.write(SERVO_CLOSED_ANGLE);
    servoRec.write(SERVO_CLOSED_ANGLE);
    servoRes.write(SERVO_CLOSED_ANGLE);
    isServoOpen = false;
    logMsg("[SERVO] Auto-closed all bins");
    sendTrashLevelToFirestore();
  }

  static unsigned long lastTrashLevelSend = 0;
  if (millis() - lastTrashLevelSend > 5000) {
    lastTrashLevelSend = millis();
    sendTrashLevelToFirestore();
  }

  // Auto-reconnect watchdog every 10 seconds
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 10000) {
    lastCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      digitalWrite(STATUS_LED_PIN, LOW);
      logMsg("[WIFI] Connection lost. Attempting reconnect...");
      WiFi.reconnect();
    } else {
      digitalWrite(STATUS_LED_PIN, HIGH);
    }
  }
}
