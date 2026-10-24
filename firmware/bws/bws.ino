/*
 * BWS firmware (Arduino Uno) - lid sensor + optional RGB status LED
 * Serial protocol: SPEC.md section 4.3 (115200 baud, ASCII, '\n'-terminated)
 *
 * The device only reports WHAT HAPPENED (lid opened / closed). The server decides
 * what it means. There is no mode logic in here.
 *
 * ---------------------------------------------------------------------------
 * WIRING
 *
 *   Photoresistor (LDR) on the TOP of a 10k divider:
 *
 *        5V ----[ LDR ]----+----[ 10k ]---- GND
 *                          |
 *                          +---- A0
 *
 *   More light -> LDR resistance drops -> A0 voltage RISES. So:
 *     lid closed (dark)  = LOW reading
 *     lid open   (light) = HIGH reading
 *   If you wired the LDR on the BOTTOM instead (10k to 5V, LDR to GND), the
 *   direction is flipped: set LIGHT_RAISES_READING to 0 below. That is the only
 *   change needed.
 *
 *   RGB LED (optional), each color through its own 220 ohm resistor:
 *     D9  -> R,  D10 -> G,  D11 -> B   (all PWM pins)
 *     Common cathode: LED common pin -> GND   (default, COMMON_ANODE 0)
 *     Common anode:   LED common pin -> 5V    (set COMMON_ANODE 1)
 *   If no LED is wired, LED commands are harmless: pins just toggle unconnected.
 * ---------------------------------------------------------------------------
 *
 * SEQUENCE NUMBERS
 *   `seq` starts at 1 after each boot and is shared by ALL numbered lines: every
 *   EVT line AND every HB line takes the next value (the counter increments for
 *   each one). So every line the host sees has a unique seq, which keeps the
 *   server's "same boot, seq already seen => duplicate" dedupe safe: a heartbeat
 *   can never be mistaken for a repeat of an earlier line. Gaps in seq are
 *   normal. BOOT has no seq (the bridge sends seq 0 for it; BOOT resets the
 *   server's counter).
 *
 * LINES WE PRINT
 *   BOOT,<fw_version>
 *   EVT,OPEN,<seq>   EVT,CLOSE,<seq>
 *   HB,<seq>,<ldr_raw>          (raw = analogRead value, 0..1023, of the smoothed signal)
 *   #<text>                     (debug comment; the bridge logs and ignores these)
 *
 * LINES WE ACCEPT
 *   LED,<G|Y|R|B|OFF>[,BLINK]
 *   CAL                          (recalibrate: keep the lid CLOSED for ~2 s)
 */

#define FW_VERSION "1.0.0"

// ---- Sensor ---------------------------------------------------------------
#define LDR_PIN A0
#define LIGHT_RAISES_READING 1   // 1 = LDR on top of divider (more light = higher). 0 = flipped.

#define SAMPLE_INTERVAL_MS 50    // read A0 every 50 ms
#define AVG_WINDOW 8             // moving average over 8 samples (400 ms)
#define CAL_DURATION_MS 2000     // boot / CAL baseline sampling time
#define OPEN_MARGIN 60           // open threshold  = baseline + OPEN_MARGIN  (in light units)
#define CLOSE_MARGIN 30          // close threshold = baseline + CLOSE_MARGIN (lower => hysteresis)
#define DEBOUNCE_MS 300          // a crossing must hold this long to count
#define HEARTBEAT_MS 10000UL

// ---- RGB LED --------------------------------------------------------------
#define PIN_LED_R 9
#define PIN_LED_G 10
#define PIN_LED_B 11
#define COMMON_ANODE 0           // 0 = common cathode (default). 1 = common anode.
#define BLINK_HALF_PERIOD_MS 500 // blink = 500 ms on, 500 ms off

// Color levels (0..255). Yellow needs less green than red to look yellow, not lime.
#define LEVEL_FULL 255
#define LEVEL_YELLOW_G 90

// ---------------------------------------------------------------------------

static int samples[AVG_WINDOW];
static uint8_t sampleIdx = 0;
static long sampleSum = 0;
static unsigned long lastSampleAt = 0;

static int baseline = 0;
static int openThreshold = 0;
static int closeThreshold = 0;

static bool lidOpen = false;           // stable (debounced) state
static bool pending = false;           // a crossing is being debounced
static unsigned long pendingSince = 0;

static unsigned long seqCounter = 0;
static unsigned long lastHeartbeatAt = 0;

// LED state
enum LedColor { LED_OFF, LED_G, LED_Y, LED_R, LED_B };
static LedColor ledColor = LED_OFF;
static bool ledBlink = false;
static unsigned long blinkEpoch = 0;
static bool ledShown = false;          // what is currently driven on the pins
static bool ledShownInit = false;

// Serial command buffer
static char cmdBuf[32];
static uint8_t cmdLen = 0;

// ---- helpers ---------------------------------------------------------------

// Normalize so that "higher = more light" regardless of wiring. Self-inverse,
// so it also converts back to the raw pin value for heartbeats.
static int toLight(int v) {
  return LIGHT_RAISES_READING ? v : (1023 - v);
}

static unsigned long nextSeq() {
  return ++seqCounter;
}

static void fillWindow(int lightValue) {
  for (uint8_t i = 0; i < AVG_WINDOW; i++) samples[i] = lightValue;
  sampleSum = (long)lightValue * AVG_WINDOW;
  sampleIdx = 0;
}

static void pushSample(int lightValue) {
  sampleSum -= samples[sampleIdx];
  samples[sampleIdx] = lightValue;
  sampleSum += lightValue;
  sampleIdx = (sampleIdx + 1) % AVG_WINDOW;
}

static int smoothedLight() {
  return (int)(sampleSum / AVG_WINDOW);
}

// ---- LED -------------------------------------------------------------------

static void writeRGB(uint8_t r, uint8_t g, uint8_t b) {
#if COMMON_ANODE
  r = 255 - r;
  g = 255 - g;
  b = 255 - b;
#endif
  analogWrite(PIN_LED_R, r);
  analogWrite(PIN_LED_G, g);
  analogWrite(PIN_LED_B, b);
}

static void driveLed(bool on) {
  if (!on) {
    writeRGB(0, 0, 0);
    return;
  }
  switch (ledColor) {
    case LED_G: writeRGB(0, LEVEL_FULL, 0); break;
    case LED_Y: writeRGB(LEVEL_FULL, LEVEL_YELLOW_G, 0); break;
    case LED_R: writeRGB(LEVEL_FULL, 0, 0); break;
    case LED_B: writeRGB(0, 0, LEVEL_FULL); break;
    default:    writeRGB(0, 0, 0); break;
  }
}

static void setLed(LedColor color, bool blink) {
  ledColor = color;
  ledBlink = blink && color != LED_OFF;
  blinkEpoch = millis();   // blinking restarts in the ON phase
  ledShownInit = false;    // force a write on the next updateLed()
}

// Non-blocking: called every loop(); only touches the pins when the output changes.
static void updateLed() {
  bool on = true;
  if (ledColor == LED_OFF) {
    on = false;
  } else if (ledBlink) {
    on = (((millis() - blinkEpoch) / BLINK_HALF_PERIOD_MS) % 2) == 0;
  }
  if (!ledShownInit || on != ledShown) {
    driveLed(on);
    ledShown = on;
    ledShownInit = true;
  }
}

// ---- calibration (the only place we use delay) ------------------------------

static void calibrate() {
  LedColor prevColor = ledColor;   // restore the server's LED state afterwards
  bool prevBlink = ledBlink;
  setLed(LED_B, false);   // solid blue while calibrating
  updateLed();

  long sum = 0;
  int n = 0;
  unsigned long start = millis();
  while (millis() - start < CAL_DURATION_MS) {
    sum += toLight(analogRead(LDR_PIN));
    n++;
    delay(SAMPLE_INTERVAL_MS);
  }
  baseline = n > 0 ? (int)(sum / n) : toLight(analogRead(LDR_PIN));
  openThreshold = baseline + OPEN_MARGIN;
  closeThreshold = baseline + CLOSE_MARGIN;
  if (openThreshold > 1000) openThreshold = 1000;       // keep reachable if baseline is high
  if (closeThreshold >= openThreshold) closeThreshold = openThreshold - 10;

  fillWindow(baseline);
  lidOpen = false;
  pending = false;
  lastSampleAt = millis();
  lastHeartbeatAt = millis();

  setLed(prevColor, prevBlink);
  updateLed();

  Serial.print(F("#CAL baseline="));
  Serial.print(baseline);
  Serial.print(F(" open>="));
  Serial.print(openThreshold);
  Serial.print(F(" close<="));
  Serial.println(closeThreshold);
}

// ---- host commands ----------------------------------------------------------

static void handleCommand(char* cmd) {
  if (strcmp(cmd, "CAL") == 0) {
    calibrate();
    return;
  }
  if (strncmp(cmd, "LED,", 4) == 0) {
    char* color = cmd + 4;
    bool blink = false;
    char* comma = strchr(color, ',');
    if (comma != NULL) {
      *comma = '\0';
      if (strcmp(comma + 1, "BLINK") == 0) {
        blink = true;
      } else {
        Serial.println(F("#ERR bad LED option"));
        return;
      }
    }
    if (strcmp(color, "G") == 0)        setLed(LED_G, blink);
    else if (strcmp(color, "Y") == 0)   setLed(LED_Y, blink);
    else if (strcmp(color, "R") == 0)   setLed(LED_R, blink);
    else if (strcmp(color, "B") == 0)   setLed(LED_B, blink);
    else if (strcmp(color, "OFF") == 0) setLed(LED_OFF, false);
    else Serial.println(F("#ERR bad LED color"));
    return;
  }
  Serial.println(F("#ERR unknown command"));
}

static void pollSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      cmdBuf[cmdLen] = '\0';
      if (cmdLen > 0) handleCommand(cmdBuf);
      cmdLen = 0;
    } else if (c == '\r') {
      // ignore
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = c;
    } else {
      cmdLen = 0;  // overflow: drop what we had; the tail will fail to parse and be ignored
    }
  }
}

// ---- lid detection -----------------------------------------------------------

static void emitEvent(bool opened) {
  Serial.print(F("EVT,"));
  Serial.print(opened ? F("OPEN,") : F("CLOSE,"));
  Serial.println(nextSeq());
}

static void emitHeartbeat() {
  Serial.print(F("HB,"));
  Serial.print(nextSeq());
  Serial.print(',');
  Serial.println(toLight(smoothedLight()));   // back to the raw pin scale
}

static void updateLid(unsigned long now) {
  int v = smoothedLight();
  bool crossing = lidOpen ? (v <= closeThreshold) : (v >= openThreshold);

  if (!crossing) {
    pending = false;    // blip ended before the debounce time: ignore it
    return;
  }
  if (!pending) {
    pending = true;
    pendingSince = now;
    return;
  }
  if (now - pendingSince >= DEBOUNCE_MS) {
    lidOpen = !lidOpen;
    pending = false;
    emitEvent(lidOpen);
  }
}

// ---- Arduino entry points ------------------------------------------------------

void setup() {
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  setLed(LED_OFF, false);
  updateLed();

  Serial.begin(115200);
  Serial.print(F("BOOT,"));
  Serial.println(F(FW_VERSION));

  calibrate();   // lid must be closed at power-up
}

void loop() {
  pollSerial();   // may run calibrate(), so read the clock only afterwards
  updateLed();

  unsigned long now = millis();

  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    pushSample(toLight(analogRead(LDR_PIN)));
    updateLid(now);
  }

  if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
    lastHeartbeatAt = now;
    emitHeartbeat();
  }
}
