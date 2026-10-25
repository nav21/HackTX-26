# BWS firmware for the TI LP-MSPM0G3507 LaunchPad

This replaces the Arduino sketch in `firmware/bws/` for the board we actually have. It speaks the
**same serial protocol** (see `firmware/README.md`), so `/bridge` and the server work unchanged.

| Folder | What it is |
| --- | --- |
| `blink/` | Phase 1 check: blinks the red LED and prints `BLINK,<n>` once a second |
| `bws/` | The real thing: reads the onboard light sensor and prints `BOOT` / `EVT,OPEN` / `EVT,CLOSE` / `HB` |
| `common/` | TI's startup code and memory map for this chip, copied from the MSPM0 SDK |
| `build.sh` | Command-line build (same flags as the CCS projects) |

## Words you'll see

- **Firmware:** the program that runs on the board's chip. It runs on its own as soon as the board gets power.
- **Flashing:** copying the compiled program into the chip's flash memory so it stays after power-off.
- **XDS110:** the second chip on the top of the LaunchPad. It's the USB "debug probe" that flashes the
  main chip and also forwards its serial output to your PC.
- **GPIO:** a pin the program switches on/off (LEDs) or reads (buttons).
- **ADC:** turns a voltage (0 to 3.3 V) into a number (0 to 4095).
- **Op-amp (OPA):** an amplifier built into the chip. Here it turns the photodiode's tiny current
  into a voltage the ADC can read.
- **UART / serial:** a simple text stream over two wires. On this board it reaches your PC as a COM port.

## The light sensor (no wiring needed)

The LaunchPad has a photodiode **D1** (Vishay VEMD4110X01). It's connected to the chip's built-in op-amp
OPA0, whose output goes to ADC channel 7 (pin PA22). Jumpers **J16, J17, J18** must be on. They are on
by default, so don't remove them. Don't connect anything to header pins **J1.5, J1.8 or J3.24** (same pins).
Source: TI user's guide SLAU873, section 2.3.7.3 and the "Light Sensor Circuit" schematic.

More light means a higher reading. When the board boots it spends 2 seconds measuring "dark" (LED solid
blue), so **keep the lid closed (or cover D1 with your finger) while it starts.**

- **LED1 (red, next to the reset button):** on while the lid is open.
- **RGB LED:** the status color the server sends (`LED,G|Y|R|B|OFF[,BLINK]`).
- **Button S2:** recalibrate (keep the lid closed). The serial command `CAL` does the same.
- **Serial command `RAW`:** toggles `#RAW <reading>` lines 4 times a second, for tuning the thresholds.

The thresholds are at the top of `bws/main.c`: `OPEN_MARGIN` and `CLOSE_MARGIN`, in ADC counts above the dark baseline.

## Build and flash

**In CCS:**
1. File > Import Projects and pick `blink/blink.projectspec` (or `bws/bws.projectspec`).
2. Plug in the LaunchPad and click the hammer (Build), then the bug/Debug (it flashes and starts).
3. To let it run, press Resume, or stop debugging and press the board's reset button.

**From a terminal:** run `./build.sh blink` or `./build.sh bws`. The output is `build/*.out`.

## See the output

Windows shows two COM ports for the board in Device Manager. Use
**"XDS110 Class Application/User UART (COMx)"** at **115200 baud**. To watch it, either:
- open CCS's serial terminal, or
- close the terminal and run the bridge: `cd bridge`, then `npm start`. Only one program can hold the COM port at a time.
