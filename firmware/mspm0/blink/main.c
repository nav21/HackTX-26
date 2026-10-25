/*
 * BWS Phase 1 - "is my toolchain working?" program for the LP-MSPM0G3507 LaunchPad.
 *
 * What it does:
 *   - Blinks LED1 (the red LED next to the reset button, pin PA0) once a second.
 *   - Prints "BLINK,<n>" once a second over the USB cable, so you can see it in a
 *     serial terminal on the "XDS110 Class Application/User UART" COM port at 115200 baud.
 *
 * Board facts used (TI LaunchPad user's guide SLAU873, schematic + jumper table):
 *   - LED1 is wired 3.3V -> LED -> 470 ohm -> PA0, so driving PA0 LOW turns it ON.
 *   - UART0 TX/RX = PA10/PA11 go to the XDS110 debug chip (jumpers J21/J22 at 1-2, the default),
 *     which shows up on Windows as a virtual COM port.
 *   - After reset the CPU runs from the internal 32 MHz oscillator (SYSOSC).
 */
#include <ti/devices/msp/msp.h>
#include <ti/driverlib/driverlib.h>
#include <stdio.h>

#define CPU_HZ 32000000u
#define POWER_STARTUP_DELAY 16

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

static void uartPrint(const char *s)
{
    while (*s) DL_UART_Main_transmitDataBlocking(UART0, (uint8_t) *s++);
}

int main(void)
{
    /* Turn on the peripherals we use (they start powered off after reset). */
    DL_GPIO_reset(GPIOA);
    DL_UART_Main_reset(UART0);
    DL_GPIO_enablePower(GPIOA);
    DL_UART_Main_enablePower(UART0);
    delay_cycles(POWER_STARTUP_DELAY);

    /* PA0 = LED1 as a digital output, start with the LED off (pin HIGH). */
    DL_GPIO_initDigitalOutput(IOMUX_PINCM1);
    DL_GPIO_setPins(GPIOA, DL_GPIO_PIN_0);
    DL_GPIO_enableOutput(GPIOA, DL_GPIO_PIN_0);

    /* PA10/PA11 = UART0 TX/RX, 115200 8N1. */
    DL_GPIO_initPeripheralOutputFunction(IOMUX_PINCM21, IOMUX_PINCM21_PF_UART0_TX);
    DL_GPIO_initPeripheralInputFunction(IOMUX_PINCM22, IOMUX_PINCM22_PF_UART0_RX);
    DL_UART_Main_setClockConfig(UART0, (DL_UART_Main_ClockConfig *) &uartClock);
    DL_UART_Main_init(UART0, (DL_UART_Main_Config *) &uartConfig);
    DL_UART_Main_configBaudRate(UART0, CPU_HZ, 115200);
    DL_UART_Main_enable(UART0);

    uartPrint("#BWS blink firmware running\n");

    char line[24];
    for (uint32_t n = 1;; n++) {
        DL_GPIO_clearPins(GPIOA, DL_GPIO_PIN_0); /* LOW = LED on */
        snprintf(line, sizeof line, "BLINK,%lu\n", (unsigned long) n);
        uartPrint(line);
        delay_cycles(CPU_HZ / 2); /* 0.5 s on */
        DL_GPIO_setPins(GPIOA, DL_GPIO_PIN_0); /* HIGH = LED off */
        delay_cycles(CPU_HZ / 2); /* 0.5 s off */
    }
}
