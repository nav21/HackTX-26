/*
 * BWS lid-sensor firmware for the TI LP-MSPM0G3507 LaunchPad.
 *
 * It reads the LaunchPad's ONBOARD light sensor, decides "lid opened" / "lid closed",
 * and prints events over the USB cable. No mode logic: the server decides what an
 * opening means. Same serial protocol as the old Arduino sketch (firmware/README.md),
 * so /bridge works unchanged.
 *
 * ---------------------------------------------------------------------------
 * HARDWARE (TI user's guide SLAU873, schematic "Light Sensor Circuit" + Table 2-1)
 *
 *   Light sensor: D1 = Vishay VEMD4110X01 photodiode, read through the MCU's own
 *   op-amp OPA0 wired as a transimpedance amplifier (2.37 Mohm feedback):
 *     PA27 = OPA0 IN0-  <- photodiode   (jumper J17, installed by default)
 *     PA26 = OPA0 IN0+  <- ground       (jumper J18, installed by default)
 *     PA22 = OPA0 OUT   -> ADC0 channel 7 (jumper J16, installed by default)
 *   More light -> more photocurrent -> higher voltage -> higher ADC reading (0..4095).
 *   No external wiring needed. Don't connect anything to BoosterPack pins J1.5, J1.8
 *   or J3.24 (they are these same pins).
 *
 *   LEDs:  LED1 red  = PA0, active LOW  (we light it while the lid is open)
 *          LED2 RGB  = PB26 red / PB27 green / PB22 blue, active HIGH (server status color)
 *   Button: S2 = PB21, active LOW (internal pull-up) -> press to recalibrate
 *   UART0: PA10 TX / PA11 RX -> XDS110 -> "XDS110 Class Application/User UART" COM port
 *
 * ---------------------------------------------------------------------------
 * SERIAL PROTOCOL (115200 8N1, ASCII lines ending in '\n')
 *   Device -> PC:
 *     BOOT,<fw_version>        once at power-up / reset
 *     EVT,OPEN,<seq>           lid opened (held for DEBOUNCE_MS)
 *     EVT,CLOSE,<seq>          lid closed
 *     HB,<seq>,<ldr>           every 10 s; ldr = smoothed reading scaled to 0..1023
 *     #<text>                  debug comment; the bridge logs and ignores these
 *   PC -> device:
 *     LED,<G|Y|R|B|OFF>[,BLINK]
 *     CAL                      recalibrate (keep the lid CLOSED for ~2 s)
 *     RAW[,ON|,OFF]            "#RAW <reading>" lines every 250 ms (for tuning); RAW alone toggles
 *   `seq` starts at 1 each boot and is shared by EVT and HB lines. BOOT has no seq.
 *
 * TIME: the board has no clock that knows the date, so we only track uptime in ms
 * (SysTick, 1 kHz). The bridge on the PC stamps each line with the real time.
 */
#include <ti/devices/msp/msp.h>
#include <ti/driverlib/driverlib.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#define FW_VERSION "mspm0-1.1.0"

/*
 * Which light sensor to read:
 *   SENSOR_LDR_PA25   (default) external photoresistor between PA25 (header J1 pin 2) and GND.
 *                     The chip's internal 40 kohm pull-up on PA25 is the other half of the
 *                     voltage divider (datasheet SLASEX6C, RPU = 40 kohm typ), so no resistor is needed:
 *                       dark box -> LDR ~ hundreds of kohm -> PA25 near 3.3 V -> high ADC reading
 *                       light    -> LDR ~ a few kohm       -> PA25 well below 1 V -> low reading
 *                     We flip it (light = 4095 - reading) so "more light = higher" like the onboard one.
 *   SENSOR_ONBOARD_D1 the LaunchPad's photodiode D1 via OPA0 -> ADC0 ch 7. Works, but in normal room
 *                     light it only reads ~2-3 of 4095; it needs a flashlight or sunlight to trigger.
 */
#define SENSOR_LDR_PA25 1
#define SENSOR_ONBOARD_D1 2
#ifndef SENSOR_SOURCE
#define SENSOR_SOURCE SENSOR_ONBOARD_D1
#endif

/*
 * Reading scale. The onboard photodiode gives a tiny signal in room light, so for it we
 * compare against the internal 1.4 V reference (instead of 3.3 V) and let the ADC hardware
 * add up 16 conversions per reading: 0..65520 instead of 0..4095.
 */
#if SENSOR_SOURCE == SENSOR_ONBOARD_D1
#define LIGHT_MAX 65520u
#define OPEN_MARGIN 60          /* open when light >= baseline + OPEN_MARGIN */
#define CLOSE_MARGIN 30         /* close when light <= baseline + CLOSE_MARGIN (gap = hysteresis) */
#define HB_SHIFT 6              /* heartbeat value = light >> 6 (bridge expects 0..1023) */
#else
#define LIGHT_MAX 4095u
#define OPEN_MARGIN 240
#define CLOSE_MARGIN 120
#define HB_SHIFT 2
#endif

/* ---- Tuning (see LIGHT_MAX / OPEN_MARGIN / CLOSE_MARGIN above for the scale) ---- */
#define SAMPLE_INTERVAL_MS 50   /* read the sensor every 50 ms */
#define AVG_WINDOW 8            /* moving average of 8 samples = 400 ms */
#define CAL_DURATION_MS 2000    /* boot / CAL baseline time (lid must be closed) */
#define MAX_OPEN_THRESHOLD (LIGHT_MAX - LIGHT_MAX / 40) /* keep it reachable on a bright baseline */
#define DEBOUNCE_MS 300         /* a crossing must hold this long to count */
#define AUTO_DARK_MS 1000       /* darker than the baseline this long -> relearn "dark" */
#define HEARTBEAT_MS 10000u
#define RAW_INTERVAL_MS 250
#define BLINK_HALF_PERIOD_MS 500

#define CPU_HZ 32000000u
#define POWER_STARTUP_DELAY 16

/* ---- Pins ---- */
#define LED1_PORT GPIOA
#define LED1_PIN DL_GPIO_PIN_0
#define RGB_PORT GPIOB
#define RGB_R DL_GPIO_PIN_26
#define RGB_G DL_GPIO_PIN_27
#define RGB_B DL_GPIO_PIN_22
#define BTN_PORT GPIOB
#define BTN_PIN DL_GPIO_PIN_21

/* ------------------------------------------------------------------------- */
/* Uptime                                                                     */
/* ------------------------------------------------------------------------- */
static volatile uint32_t gMillis = 0;

void SysTick_Handler(void) { gMillis++; }

static uint32_t millis(void) { return gMillis; }

static void delayMs(uint32_t ms)
{
    uint32_t start = millis();
    while (millis() - start < ms) {}
}

/* ------------------------------------------------------------------------- */
/* UART                                                                       */
/* ------------------------------------------------------------------------- */
static const DL_UART_Main_ClockConfig uartClock = {
    .clockSel = DL_UART_MAIN_CLOCK_BUSCLK,
    .divideRatio = DL_UART_MAIN_CLOCK_DIVIDE_RATIO_1,
};
static const DL_UART_Main_Config uartConfig = {
    .mode = DL_UART_MAIN_MODE_NORMAL,
    .direction = DL_UART_MAIN_DIRECTION_TX_RX,
    .flowControl = DL_UART_MAIN_FLOW_CONTROL_NONE,
    .parity = DL_UART_MAIN_PARITY_NONE,
    .wordLength = DL_UART_MAIN_WORD_LENGTH_8_BITS,
    .stopBits = DL_UART_MAIN_STOP_BITS_ONE,
};

static void print(const char *s)
{
    while (*s) DL_UART_Main_transmitDataBlocking(UART0, (uint8_t) *s++);
}

static void printf_line(const char *fmt, unsigned long a, unsigned long b, unsigned long c)
{
    char buf[64];
    snprintf(buf, sizeof buf, fmt, a, b, c);
    print(buf);
}

/* ------------------------------------------------------------------------- */
/* Light sensor: OPA0 (transimpedance) -> ADC0 channel 7                      */
/* Settings follow TI's out-of-box demo (SDK demos/out_of_box/lightsensor.c), */
/* but with software-triggered single conversions instead of a timer.         */
/* ------------------------------------------------------------------------- */
static const DL_OPA_Config opaConfig = {
    .pselChannel = DL_OPA_PSEL_IN0_POS,   /* + input: PA26 (tied to GND via J18) */
    .nselChannel = DL_OPA_NSEL_IN0_NEG,   /* - input: PA27 (photodiode via J17) */
    .mselChannel = DL_OPA_MSEL_OPEN,      /* feedback is the external 2.37 Mohm resistor */
    .gain = DL_OPA_GAIN_N0_P1,
    .outputPinState = DL_OPA_OUTPUT_PIN_ENABLED, /* output on PA22 = ADC0 ch 7 */
    .choppingMode = DL_OPA_CHOPPING_MODE_DISABLE,
};

static const DL_ADC12_ClockConfig adcClock = {
    .clockSel = DL_ADC12_CLOCK_SYSOSC,
    .divideRatio = DL_ADC12_CLOCK_DIVIDE_4, /* 8 MHz sample clock */
    .freqRange = DL_ADC12_CLOCK_FREQ_RANGE_24_TO_32,
};

static const DL_VREF_ClockConfig vrefClock = {
    .clockSel = DL_VREF_CLOCK_BUSCLK,
    .divideRatio = DL_VREF_CLOCK_DIVIDE_1,
};
static const DL_VREF_Config vrefConfig = {
    .vrefEnable = DL_VREF_ENABLE_ENABLE,
    .bufConfig = DL_VREF_BUFCONFIG_OUTPUT_1_4V,
    .shModeEnable = DL_VREF_SHMODE_DISABLE,
    .holdCycleCount = DL_VREF_HOLD_MIN,
    .shCycleCount = DL_VREF_SH_MIN,
};

static void sensorInit(void)
{
    DL_OPA_disableRailToRailInput(OPA0);
    DL_OPA_setGainBandwidth(OPA0, DL_OPA_GBW_HIGH);
    DL_OPA_init(OPA0, (DL_OPA_Config *) &opaConfig);
    DL_OPA_enable(OPA0);

    DL_ADC12_setClockConfig(ADC0, (DL_ADC12_ClockConfig *) &adcClock);
    DL_ADC12_initSingleSample(ADC0, DL_ADC12_REPEAT_MODE_DISABLED,
        DL_ADC12_SAMPLING_SOURCE_AUTO, DL_ADC12_TRIG_SRC_SOFTWARE,
        DL_ADC12_SAMP_CONV_RES_12_BIT, DL_ADC12_SAMP_CONV_DATA_FORMAT_UNSIGNED);
#if SENSOR_SOURCE == SENSOR_LDR_PA25
    /* PA25 (IOMUX_PINCM55) stays analog; only its internal pull-up is switched on. */
    DL_GPIO_setAnalogInternalResistor(IOMUX_PINCM55, DL_GPIO_RESISTOR_PULL_UP);
    DL_ADC12_configConversionMem(ADC0, DL_ADC12_MEM_IDX_0, DL_ADC12_INPUT_CHAN_2, /* PA25 = A0_2 */
        DL_ADC12_REFERENCE_VOLTAGE_VDDA, DL_ADC12_SAMPLE_TIMER_SOURCE_SCOMP0,
        DL_ADC12_AVERAGING_MODE_DISABLED, DL_ADC12_BURN_OUT_SOURCE_DISABLED,
        DL_ADC12_TRIGGER_MODE_AUTO_NEXT, DL_ADC12_WINDOWS_COMP_MODE_DISABLED);
#else
    /* Internal 1.4 V reference (TI example adc12_single_conversion_vref_internal). */
    DL_VREF_setClockConfig(VREF, (DL_VREF_ClockConfig *) &vrefClock);
    DL_VREF_configReference(VREF, (DL_VREF_Config *) &vrefConfig);
    uint32_t t0 = millis();
    while (DL_VREF_getStatus(VREF) == DL_VREF_CTL1_READY_NOTRDY && millis() - t0 < 50) {}
    /* 16 conversions summed per reading (divide by 1) -> 0..65520 */
    DL_ADC12_configHwAverage(ADC0, DL_ADC12_HW_AVG_NUM_ACC_16, DL_ADC12_HW_AVG_DEN_DIV_BY_1);
    DL_ADC12_configConversionMem(ADC0, DL_ADC12_MEM_IDX_0, DL_ADC12_INPUT_CHAN_7, /* PA22 = OPA0 out */
        DL_ADC12_REFERENCE_VOLTAGE_INTREF, DL_ADC12_SAMPLE_TIMER_SOURCE_SCOMP0,
        DL_ADC12_AVERAGING_MODE_ENABLED, DL_ADC12_BURN_OUT_SOURCE_DISABLED,
        DL_ADC12_TRIGGER_MODE_AUTO_NEXT, DL_ADC12_WINDOWS_COMP_MODE_DISABLED);
#endif
    DL_ADC12_setSampleTime0(ADC0, 100); /* 100 / 8 MHz = 12.5 us */
    DL_ADC12_setPowerDownMode(ADC0, DL_ADC12_POWER_DOWN_MODE_MANUAL);
    DL_ADC12_clearInterruptStatus(ADC0, DL_ADC12_INTERRUPT_MEM0_RESULT_LOADED);
    DL_ADC12_enableConversions(ADC0);
}

/* One reading, 0..4095 (higher = more light). Polls the "result ready" flag. */
static uint16_t readLight(void)
{
    DL_ADC12_clearInterruptStatus(ADC0, DL_ADC12_INTERRUPT_MEM0_RESULT_LOADED);
    DL_ADC12_startConversion(ADC0);
    uint32_t start = millis();
    while (!DL_ADC12_getRawInterruptStatus(ADC0, DL_ADC12_INTERRUPT_MEM0_RESULT_LOADED)) {
        if (millis() - start > 5) break; /* never hang the main loop */
    }
    uint16_t v = DL_ADC12_getMemResult(ADC0, DL_ADC12_MEM_IDX_0);
    DL_ADC12_enableConversions(ADC0); /* single mode: re-arm for the next start */
#if SENSOR_SOURCE == SENSOR_LDR_PA25
    v = 4095 - (v & 0x0FFF); /* LDR on the bottom of the divider: more light = lower voltage */
#endif
    return v;
}

/* ------------------------------------------------------------------------- */
/* LEDs                                                                       */
/* ------------------------------------------------------------------------- */
typedef enum { LED_OFF, LED_G, LED_Y, LED_R, LED_B } LedColor;

static LedColor ledColor = LED_OFF;
static bool ledBlink = false;
static uint32_t blinkEpoch = 0;
static int ledShown = -1; /* -1 = force a write */

static void writeRgb(bool r, bool g, bool b)
{
    if (r) DL_GPIO_setPins(RGB_PORT, RGB_R); else DL_GPIO_clearPins(RGB_PORT, RGB_R);
    if (g) DL_GPIO_setPins(RGB_PORT, RGB_G); else DL_GPIO_clearPins(RGB_PORT, RGB_G);
    if (b) DL_GPIO_setPins(RGB_PORT, RGB_B); else DL_GPIO_clearPins(RGB_PORT, RGB_B);
}

static void driveRgb(bool on)
{
    if (!on) { writeRgb(false, false, false); return; }
    switch (ledColor) {
        case LED_G: writeRgb(false, true, false); break;
        case LED_Y: writeRgb(true, true, false); break; /* red + green = yellow-ish */
        case LED_R: writeRgb(true, false, false); break;
        case LED_B: writeRgb(false, false, true); break;
        default:    writeRgb(false, false, false); break;
    }
}

static void setLed(LedColor color, bool blink)
{
    ledColor = color;
    ledBlink = blink && color != LED_OFF;
    blinkEpoch = millis(); /* blinking restarts in the ON phase */
    ledShown = -1;
}

static void updateLed(void)
{
    bool on = ledColor != LED_OFF;
    if (on && ledBlink) on = ((millis() - blinkEpoch) / BLINK_HALF_PERIOD_MS) % 2 == 0;
    if (ledShown != (int) on) {
        driveRgb(on);
        ledShown = on;
    }
}

static void setLidLed(bool open)
{
    if (open) DL_GPIO_clearPins(LED1_PORT, LED1_PIN); /* active LOW */
    else DL_GPIO_setPins(LED1_PORT, LED1_PIN);
}

/* ------------------------------------------------------------------------- */
/* Lid detection                                                              */
/* ------------------------------------------------------------------------- */
static uint16_t samples[AVG_WINDOW];
static uint8_t sampleIdx = 0;
static uint32_t sampleSum = 0;
static uint32_t lastSampleAt = 0;

static uint16_t baseline = 0, openThreshold = 0, closeThreshold = 0;
static bool lidOpen = false;     /* stable (debounced) state */
static bool pending = false;     /* a crossing is being debounced */
static uint32_t pendingSince = 0;

static uint32_t seqCounter = 0;
static uint32_t lastHeartbeatAt = 0;
static bool rawOn = false;
static uint32_t lastRawAt = 0;

static uint32_t nextSeq(void) { return ++seqCounter; }

static void fillWindow(uint16_t v)
{
    for (uint8_t i = 0; i < AVG_WINDOW; i++) samples[i] = v;
    sampleSum = (uint32_t) v * AVG_WINDOW;
    sampleIdx = 0;
}

static void pushSample(uint16_t v)
{
    sampleSum -= samples[sampleIdx];
    samples[sampleIdx] = v;
    sampleSum += v;
    sampleIdx = (sampleIdx + 1) % AVG_WINDOW;
}

static uint16_t smoothed(void) { return (uint16_t) (sampleSum / AVG_WINDOW); }

/* Dark level -> open/close thresholds (open above close = hysteresis). */
static void setBaseline(uint16_t dark)
{
    baseline = dark;
    uint32_t open = (uint32_t) baseline + OPEN_MARGIN;
    if (open > MAX_OPEN_THRESHOLD) open = MAX_OPEN_THRESHOLD;
    openThreshold = (uint16_t) open;
    closeThreshold = (uint16_t) (baseline + CLOSE_MARGIN);
    if (closeThreshold + 20 > openThreshold) closeThreshold = openThreshold - 20;
}

static void calibrate(void)
{
    LedColor prevColor = ledColor; /* restore the server's LED state afterwards */
    bool prevBlink = ledBlink;
    setLed(LED_B, false); /* solid blue while calibrating */
    updateLed();

    uint32_t sum = 0, n = 0, start = millis();
    while (millis() - start < CAL_DURATION_MS) {
        sum += readLight();
        n++;
        delayMs(SAMPLE_INTERVAL_MS);
    }
    setBaseline(n ? (uint16_t) (sum / n) : readLight());

    fillWindow(baseline);
    lidOpen = false;
    pending = false;
    setLidLed(false);
    lastSampleAt = lastHeartbeatAt = millis();
    setLed(prevColor, prevBlink);
    updateLed();
    printf_line("#CAL baseline=%lu open>=%lu close<=%lu\n", baseline, openThreshold, closeThreshold);
}

static void emitEvent(bool opened)
{
    printf_line(opened ? "EVT,OPEN,%lu\n" : "EVT,CLOSE,%lu\n", nextSeq(), 0, 0);
}

static void emitHeartbeat(void)
{
    /* The bridge expects 0..1023 (Arduino scale), so scale the reading down. */
    uint32_t hb = smoothed() >> HB_SHIFT;
    printf_line("HB,%lu,%lu\n", nextSeq(), hb > 1023 ? 1023 : hb, 0);
}

static void updateLid(uint32_t now)
{
    uint16_t light = smoothed();
    bool crossing = lidOpen ? (light <= closeThreshold) : (light >= openThreshold);
    /*
     * Auto-relearn "dark": if it calibrated with the lid open (or the room got darker), a closed
     * lid reads clearly below the baseline. After AUTO_DARK_MS of that, adopt it as the new dark.
     */
    static uint32_t darkerSince = 0;
    if (!lidOpen && light + CLOSE_MARGIN < baseline) {
        if (!darkerSince) darkerSince = now ? now : 1;
        else if (now - darkerSince >= AUTO_DARK_MS) {
            darkerSince = 0;
            setBaseline(light);
            printf_line("#CAL auto baseline=%lu open>=%lu close<=%lu\n", baseline, openThreshold, closeThreshold);
        }
    } else {
        darkerSince = 0;
    }

    if (!crossing) { pending = false; return; }
    if (!pending) { pending = true; pendingSince = now; return; }
    if (now - pendingSince >= DEBOUNCE_MS) {
        lidOpen = !lidOpen;
        pending = false;
        setLidLed(lidOpen);
        emitEvent(lidOpen);
    }
}

/* ------------------------------------------------------------------------- */
/* Commands from the PC                                                       */
/* ------------------------------------------------------------------------- */
static char cmdBuf[32];
static uint8_t cmdLen = 0;

static void handleCommand(char *cmd)
{
    if (strcmp(cmd, "CAL") == 0) { calibrate(); return; }
    if (strcmp(cmd, "RAW") == 0 || strcmp(cmd, "RAW,ON") == 0 || strcmp(cmd, "RAW,OFF") == 0) {
        rawOn = cmd[3] == '\0' ? !rawOn : cmd[5] == 'N'; /* RAW toggles; RAW,ON / RAW,OFF set */
        print(rawOn ? "#RAW on\n" : "#RAW off\n");
        return;
    }
    if (strncmp(cmd, "LED,", 4) == 0) {
        char *color = cmd + 4;
        bool blink = false;
        char *comma = strchr(color, ',');
        if (comma) {
            *comma = '\0';
            if (strcmp(comma + 1, "BLINK") == 0) blink = true;
            else { print("#ERR bad LED option\n"); return; }
        }
        if (strcmp(color, "G") == 0) setLed(LED_G, blink);
        else if (strcmp(color, "Y") == 0) setLed(LED_Y, blink);
        else if (strcmp(color, "R") == 0) setLed(LED_R, blink);
        else if (strcmp(color, "B") == 0) setLed(LED_B, blink);
        else if (strcmp(color, "OFF") == 0) setLed(LED_OFF, false);
        else print("#ERR bad LED color\n");
        return;
    }
    print("#ERR unknown command\n");
}

static void pollSerial(void)
{
    while (!DL_UART_Main_isRXFIFOEmpty(UART0)) {
        char c = (char) DL_UART_Main_receiveData(UART0);
        if (c == '\n') {
            cmdBuf[cmdLen] = '\0';
            if (cmdLen > 0) handleCommand(cmdBuf);
            cmdLen = 0;
        } else if (c == '\r') {
            /* ignore (Windows line endings) */
        } else if (cmdLen < sizeof cmdBuf - 1) {
            cmdBuf[cmdLen++] = c;
        } else {
            cmdLen = 0; /* overflow: drop it */
        }
    }
}

/* S2 (PB21) pressed -> recalibrate. Simple edge detect with a 50 ms debounce. */
static void pollButton(uint32_t now)
{
    static bool wasDown = false;
    static uint32_t changedAt = 0;
    bool down = DL_GPIO_readPins(BTN_PORT, BTN_PIN) == 0; /* active LOW */
    if (down != wasDown && now - changedAt > 50) {
        wasDown = down;
        changedAt = now;
        if (down) {
            print("#S2 pressed: recalibrating, keep the lid closed\n");
            calibrate();
        }
    }
}

/* ------------------------------------------------------------------------- */
/* Setup                                                                      */
/* ------------------------------------------------------------------------- */
static void boardInit(void)
{
    /* Peripherals start powered off after reset: reset + power them first. */
    DL_GPIO_reset(GPIOA);
    DL_GPIO_reset(GPIOB);
    DL_UART_Main_reset(UART0);
    DL_OPA_reset(OPA0);
    DL_ADC12_reset(ADC0);
    DL_VREF_reset(VREF);
    DL_GPIO_enablePower(GPIOA);
    DL_GPIO_enablePower(GPIOB);
    DL_UART_Main_enablePower(UART0);
    DL_OPA_enablePower(OPA0);
    DL_ADC12_enablePower(ADC0);
    DL_VREF_enablePower(VREF);
    delay_cycles(POWER_STARTUP_DELAY);

    /* LED1 (PA0) and the RGB LED (PB22/26/27) as outputs, all off. */
    DL_GPIO_initDigitalOutput(IOMUX_PINCM1);   /* PA0 */
    DL_GPIO_initDigitalOutput(IOMUX_PINCM50);  /* PB22 blue */
    DL_GPIO_initDigitalOutput(IOMUX_PINCM57);  /* PB26 red */
    DL_GPIO_initDigitalOutput(IOMUX_PINCM58);  /* PB27 green */
    DL_GPIO_setPins(LED1_PORT, LED1_PIN);
    DL_GPIO_clearPins(RGB_PORT, RGB_R | RGB_G | RGB_B);
    DL_GPIO_enableOutput(LED1_PORT, LED1_PIN);
    DL_GPIO_enableOutput(RGB_PORT, RGB_R | RGB_G | RGB_B);

    /* S2 (PB21) as input with the internal pull-up (the board has no external one). */
    DL_GPIO_initDigitalInputFeatures(IOMUX_PINCM49, DL_GPIO_INVERSION_DISABLE,
        DL_GPIO_RESISTOR_PULL_UP, DL_GPIO_HYSTERESIS_DISABLE, DL_GPIO_WAKEUP_DISABLE);

    /* UART0 on PA10/PA11, 115200 8N1. */
    DL_GPIO_initPeripheralOutputFunction(IOMUX_PINCM21, IOMUX_PINCM21_PF_UART0_TX);
    DL_GPIO_initPeripheralInputFunction(IOMUX_PINCM22, IOMUX_PINCM22_PF_UART0_RX);
    DL_UART_Main_setClockConfig(UART0, (DL_UART_Main_ClockConfig *) &uartClock);
    DL_UART_Main_init(UART0, (DL_UART_Main_Config *) &uartConfig);
    DL_UART_Main_configBaudRate(UART0, CPU_HZ, 115200);
    DL_UART_Main_enable(UART0);

    /* 1 ms tick for uptime (sensorInit uses it for a timeout). */
    SysTick_Config(CPU_HZ / 1000);

    sensorInit();
}

int main(void)
{
    boardInit();
    delayMs(20); /* let the op-amp output settle */

    print("BOOT," FW_VERSION "\n");
#if SENSOR_SOURCE == SENSOR_LDR_PA25
    print("#sensor: photoresistor on PA25 (J1.2) to GND, internal pull-up\n");
#else
    print("#sensor: onboard photodiode D1 (OPA0 -> ADC0 ch7)\n");
#endif
    calibrate();

    for (;;) {
        uint32_t now = millis();
        pollSerial();
        pollButton(now);

        if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
            lastSampleAt = now;
            pushSample(readLight());
            updateLid(now);
        }
        if (rawOn && now - lastRawAt >= RAW_INTERVAL_MS) {
            lastRawAt = now;
            printf_line("#RAW %lu open>=%lu close<=%lu\n", smoothed(), openThreshold, closeThreshold);
        }
        if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
            lastHeartbeatAt = now;
            emitHeartbeat();
        }
        updateLed();
    }
}
