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

The signal is small in room light, so the firmware compares against the internal 1.4 V reference and lets
the ADC add up 16 conversions per reading (0..65520). Measured on our board: **covered/dark ~75, desk lamp
room light ~285**, noise about +/-10. Opens at dark + 60 and closes at dark + 30.

**How "dark" is learned:** at boot it measures for 2 s (RGB LED solid blue), which assumes the lid is
closed. If it booted with the lid open, it notices: once a closed lid reads clearly darker than the
baseline for 1 s, it adopts that as the new dark and prints `#CAL auto ...`. You can also recalibrate
any time with the lid closed: press **S2** or send `CAL`.

- **LED1 (red, next to the reset button):** on while the lid is open.
- **RGB LED:** the status color the server sends (`LED,G|Y|R|B|OFF[,BLINK]`).
- **`RAW,ON` / `RAW,OFF`:** prints `#RAW <reading>` 4 times a second, for tuning. `RAW` alone toggles.

The thresholds are at the top of `bws/main.c` (`OPEN_MARGIN`, `CLOSE_MARGIN`).

**External photoresistor option:** build with `SENSOR_SOURCE=SENSOR_LDR_PA25` to use a photoresistor
between header **J1.2 (PA25)** and a **GND** pin instead. The chip's internal 40 kohm pull-up
(datasheet SLASEX6C, RPU) is the other half of the divider, so no extra resistor is needed. Never
connect it to 3V3 (J1.1, right next to J1.2).

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
