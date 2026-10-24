# BWS firmware

One small Arduino sketch (`bws/bws.ino`). It reads a photoresistor, decides "lid opened" / "lid closed",
and prints events over USB serial. It optionally drives an RGB status LED. It has no mode logic: the
server decides what an opening means.

## Parts

| Part | Notes |
| --- | --- |
| Arduino Uno (or compatible), USB cable | Plugged into the laptop running `/bridge` |
| Photoresistor (LDR) | Any common GL55xx type |
| 10k ohm resistor | Voltage divider with the LDR |
| RGB LED (optional) | Common cathode (default) or common anode |
| 3 x 220 ohm resistors (optional) | One per LED color |
| Opaque box, breadboard, jumper wires | Inside of the box must be dark when the lid is closed |

## Wiring

```
 LDR divider (LDR on TOP, more light = higher A0 reading)

   5V ----[ LDR ]----+----[ 10k ]---- GND
                     |
                     +---------------- A0


 RGB LED (optional, common cathode)

   D9  ----[220]---- R \
   D10 ----[220]---- G  >  RGB LED  ---- common cathode (longest leg) ---- GND
   D11 ----[220]---- B /

   Common anode LED: wire the common pin to 5V instead of GND and set
   `#define COMMON_ANODE 1` in bws.ino.
```

If you wire the divider the other way round (10k to 5V, LDR to GND), set
`#define LIGHT_RAISES_READING 0` at the top of the sketch. Nothing else changes.

Mount the LDR inside the box facing the lid so a closed lid reads dark. Put the LED outside.

## Upload (Arduino IDE)

1. Install the Arduino IDE (2.x) from arduino.cc.
2. Open `firmware/bws/bws.ino`. (The folder name must match the sketch name: `bws`.)
3. Tools > Board > Arduino Uno. Tools > Port > the COM port of your board.
4. Click Upload.
5. Tools > Serial Monitor, baud **115200**, line ending "Newline". You should see
   `BOOT,1.0.0` then, 2 seconds later, `#CAL baseline=... open>=... close<=...`.
6. Close the Serial Monitor before starting the bridge. Only one program can hold the port.

Calibration runs on every power-up and assumes the **lid is closed** (the LED shows solid blue for
about 2 s). To recalibrate later, send `CAL` (type it in the Serial Monitor, or the server can queue it).

## Serial protocol (115200 baud, ASCII, `\n`-terminated)

Device to host:

```
BOOT,<fw_version>          once at power-up / reset
EVT,OPEN,<seq>             lid opened (debounced 300 ms)
EVT,CLOSE,<seq>            lid closed
HB,<seq>,<ldr_raw>         every 10 s; ldr_raw = smoothed analogRead (0..1023)
#<text>                    debug comment (calibration result, errors); the bridge ignores these
```

Host to device:

```
LED,<G|Y|R|B|OFF>[,BLINK]  e.g. LED,Y,BLINK  (Y = yellow, B = blue)
CAL                        recalibrate (lid closed)
```

`seq` starts at 1 after each boot and is shared by `EVT` and `HB` lines: each one takes the next
number, so every numbered line is unique within a boot (gaps are normal). This keeps the server's
dedupe ("same boot, seq already seen") safe for heartbeats. `BOOT` carries no seq; the bridge sends
`seq: 0` for it.

## Tuning

At the top of `bws.ino`:

| Define | Default | Meaning |
| --- | --- | --- |
| `LIGHT_RAISES_READING` | 1 | 1 = LDR on top of divider. 0 = flipped wiring |
| `OPEN_MARGIN` | 60 | Open when smoothed light >= baseline + this |
| `CLOSE_MARGIN` | 30 | Close when smoothed light <= baseline + this (smaller than open: hysteresis) |
| `DEBOUNCE_MS` | 300 | A crossing must hold this long |
| `COMMON_ANODE` | 0 | 1 for common-anode LEDs |
| `PIN_LED_R/G/B` | 9/10/11 | LED pins (keep PWM-capable) |

If a closed lid reads too bright (leaky box), the baseline just rises to match; if the open reading
is not at least `OPEN_MARGIN` above the closed reading the lid will never register, so increase the
light contact or lower `OPEN_MARGIN`. The `HB` raw value and the `#CAL` line show you the numbers.

## Troubleshooting

- **Opens read as closes (inverted):** flip `LIGHT_RAISES_READING`.
- **Nothing happens when the lid opens:** check the `#CAL` line; the gap between baseline and the
  open reading must exceed `OPEN_MARGIN`.
- **Upload fails / port busy:** close the Serial Monitor and the bridge, then upload again.
- **Yellow looks green:** lower `LEVEL_YELLOW_G`.
