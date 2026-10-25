# TSWIFT bridge

A small Node script that runs on the laptop the Arduino is plugged into. It is a dumb pipe:

```
Arduino --USB serial--> bridge --HTTPS POST /api/device/events--> server
Arduino <--USB serial-- bridge <--GET /api/device/commands (every 1 s)-- server
```

No hardware? Use `--mock` (below). Backend and frontend can be built entirely against the mock.

## Setup

```bash
cd bridge
npm install
cp .env.example .env     # then fill it in
```

`.env`:

| Variable | Meaning |
| --- | --- |
| `API_URL` | Server base URL, e.g. `http://localhost:3001` or the deployed URL. No trailing slash needed. |
| `DEVICE_ID` | Printed by `npm run create-device` (new device) or `npm run device:rotate-secret` (existing device) in `/server` |
| `DEVICE_SECRET` | Printed once by either script (the server only stores a hash) |
| `SERIAL_PATH` | e.g. `COM3`, `/dev/ttyACM0`, `/dev/cu.usbmodem1101`. Leave **empty** to auto-detect an Arduino. |

Missing variables produce a clear error at startup. `.env` is git-ignored: never commit the secret.

### One board, several devices

The bridge always authenticates as one device (the "board"), but its lid events **follow the device its
owner currently has open in the app**: opening Grandma's pillbox page makes the real box count as the
pillbox (dose taken), opening the Creatine tub makes it count as the tub (streak), and so on. The server does
this (`profiles.live_device_id`, see API.md); the bridge protocol doesn't change. The device page shows a
"Real box live here" chip on the device that's being driven. If nothing is open yet, or the owner doesn't own
that device, events land on the board's own device as usual. The simulator is unaffected.

To run the board as one of your existing devices, give it a fresh secret (the old one stops working):

```bash
cd server
npm run device:rotate-secret -- --name "Grandma's pillbox" --owner you@example.com   # or: -- --device <id>
```

## Run

```bash
npm start        # real Arduino
npm run mock     # fake box, no hardware
npm test         # unit tests (node --test)
```

### Mock mode

`npm run mock` behaves like the firmware: it prints `BOOT,mock-1.0`, takes a shared incrementing `seq` for
every event and heartbeat, and sends a heartbeat every 10 s. Keys (no Enter needed):

| Key | Action |
| --- | --- |
| `o` | lid opens (`EVT,OPEN,<seq>`) |
| `c` | lid closes (`EVT,CLOSE,<seq>`) |
| `h` | send a heartbeat now |
| `q` / Ctrl+C | quit (tries to flush unsent events first) |

LED commands queued by the server are printed prominently, e.g. `LED -> yellow blinking`.

Non-interactive (CI, or when the terminal does not give raw keys):

```bash
node index.js --script "o,c,o"                    # one step per second, exits once everything is sent
node index.js --script "o,c" --script-interval 300
```

Steps are `o`, `c`, `h`. The script exits 0 when the queue has drained (plus one command-poll so you see LED
reactions), or 1 if the server never accepted the events within 30 s.

### Example log

```
[12:01:03] ← EVT,OPEN,4
[12:01:03] → POST 1 event ok (accepted 1, duplicates 0)
[12:01:04] ← server command LED,Y,BLINK
[12:01:04] → LED,Y,BLINK (serial)
```

## Behavior

- **Never drops events.** Events are queued in memory and POSTed in batches (up to 100). On any failure
  (server down, 5xx, 401, timeout) the batch stays queued and is retried with exponential backoff
  (0.5 s up to 15 s). The server dedupes by `seq`, so a resend is safe. If the server rejects a payload as
  malformed (400/422) the batch is split to isolate the bad event, which is parked and retried every 30 s
  so it can't block the rest.
- **Not durable across restarts.** The queue is in memory; if you quit with the server down, unsent events
  are lost (a warning is printed). Keep the server reachable, or wait for the queue to flush before quitting.
- `at` on each event is when the bridge read the line, so offline periods keep correct timestamps.
- `BOOT` is sent with `seq: 0` (the firmware does not number it); the server resets its counter on BOOT.
- `seq` is shared by `EVT` and `HB` lines, so every line in one boot has a unique `seq`.
- Lines starting with `#` are firmware debug output: logged, not forwarded. Any other malformed line is
  logged as a warning and ignored.
- Server commands are validated (`LED,<G|Y|R|B|OFF>[,BLINK]`, `CAL`) before being written to the board.
- Commands are only fetched while the board is connected, so none are lost while it is unplugged.
- Auto-reconnect: if the board is unplugged, the bridge looks for it every 2 s and resumes. The Arduino
  resets when the port opens, so you'll see a fresh `BOOT` and a 2 s recalibration (keep the lid closed).

Auto-detect matches USB vendor ids for Arduino (2341, 2a03), CH340/CH341 clones (1a86), FTDI (0403),
CP210x (10c4), Adafruit (239a), SparkFun (1b4f), or a manufacturer name containing Arduino/FTDI/wch/etc.
If your board isn't found, set `SERIAL_PATH` explicitly.

## Troubleshooting

- **"port is busy or not accessible" / "Access denied":** another program has the port. Close the Arduino IDE
  Serial Monitor (and the Serial Plotter, PuTTY, a second bridge...). Only one program can open a COM port.
  Uploading a sketch needs the bridge stopped for the same reason.
- **"No Arduino found on any serial port":** check the cable (some are charge-only), try another USB port, and
  look in Device Manager > Ports (COM & LPT). Clone boards need the CH340 driver. Then set `SERIAL_PATH=COMx`.
- **`HTTP 401 unauthorized`:** wrong `DEVICE_ID` / `DEVICE_SECRET`. The secret is only shown once by
  `create-device`; if lost, run `npm run device:rotate-secret` for that device. The bridge keeps retrying, so fixing `.env` and restarting is enough.
- **`cannot reach http://... (ECONNREFUSED)`:** the server isn't running or `API_URL` is wrong. Events are
  queued and sent when it is back. On Render's free tier the first request after idle can take ~30 s.
- **Garbled lines / "ignoring malformed line":** baud mismatch (must be 115200) or a half-line while the board
  was resetting. A few at connect time are normal.
- **Keys do nothing in `--mock`:** the terminal must be interactive (a real TTY). Under some wrappers raw keys
  aren't passed through; use `--script "o,c,o"`.
- **Opens and closes are inverted:** see `firmware/README.md` (`LIGHT_RAISES_READING`).

## Files

| File | Role |
| --- | --- |
| `index.js` | wiring, CLI, command polling, shutdown |
| `protocol.js` | parse device lines, validate/describe host commands (pure) |
| `queue.js` | batching + retry/backoff queue (pure, injectable `send`) |
| `api.js` | `fetch` client for the two device endpoints |
| `serial.js` | port auto-detect, open, auto-reconnect |
| `mock.js` | fake firmware for `--mock` |
| `config.js`, `log.js` | env/CLI parsing, timestamped logging |
| `test/` | `node --test` unit tests |
