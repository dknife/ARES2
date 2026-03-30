# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ARES (Autonomous Rover Exploration System) — an educational robotics project with a block-coding web UI that controls a Raspberry Pi Pico rover over Bluetooth (BLE/UART). Target audience is elementary-school-age children.

## Architecture

Three runtime domains:

1. **Web UI** (`Web/`) — Static HTML/JS using Google Blockly for visual block coding and Web Bluetooth for BLE communication. Entry points: `main.html` (block editor), `dashboard.html` (system monitoring). Uses ES modules (`import`/`export`).
2. **MicroPython Firmware** (`Pico/`) — Runs on Raspberry Pi Pico. `main.py` → `AresRover` boots UART, then loops reading BLE commands → `CommandProcessor` (`process_data.py`) dispatches to hardware modules. Hardware is accessed via a singleton `robot` from `hardware.py`.
3. **AI Assistant** (`AI/ai.py`) — Local LLM (EXAONE-3.5-2.4B) that answers children's questions about the block-coding interface. Uses PyTorch + Hugging Face transformers.

### Data Flow

```
[Web UI] --Web Bluetooth (HM-10/BT05)--> [Pico UART 9600 baud] --> CommandProcessor
                                                                        ↓
[Web UI] <--BLE response (20-byte chunks)-- [Pico UART] <-- Hardware modules
```

- Commands are newline-delimited text strings
- BLE max chunk size: 20 bytes (both directions)
- Web Bluetooth requires `localhost` or HTTPS (not `file://`)

### Firmware Module Pattern

All hardware modules follow the same pattern in `hardware.py`:
- Check `system_config.is_module_enabled('module_name')`
- Try-except import and init; set to `None` on failure
- `process_data.py` checks `if not robot.module: return 0` before use

Modules (all optional via `system.json`): wheel, dcmotor, buzzer, distance, magsensor, leds, gun, oled.

### Web UI Module Structure

| File | Role |
|------|------|
| `blocklyconfig.js` | Blockly block definitions and code generators |
| `commandexecutor.js` | Translates Blockly blocks → command strings, sends via BLE |
| `bluetooth.js` | `BluetoothManager` — BLE connection, chunked send/receive |
| `constants.js` | UUIDs, BLE timing, default config |
| `state.js` | Global state |
| `elements.js` | DOM element references |

## Development Commands

### Web UI testing
```bash
cd Web
python -m http.server 8000
# Open http://localhost:8000/main.html
```

### Firmware deployment
Upload all `.py` files from `Pico/` to the Pico using Thonny, ampy, or rshell. Serial debug at 9600 baud.

## Key Constraints

- **MicroPython RAM is limited** — avoid large buffers (`MAX_BUFFER_SIZE = 512`), no `json.indent` support
- **BLE 20-byte chunking** is mandatory for all sent/received data
- **Device name max 10 chars** (BT05/HMSoft limitation)
- **Hardware singleton** — never create a second `RobotHardware` instance
- **GPIO pins** are centrally managed in `Pico/pins.py`; runtime pin changes require reboot
- **Do not modify** legacy/backup files (`Pico/backup/`)

## Common Modification Paths

| Task | Files to change |
|------|----------------|
| Add a new Blockly block | `Web/blocklyconfig.js`, `Web/main.html` (toolbox XML), `Web/commandexecutor.js` |
| Add a new firmware command | `Pico/process_data.py` (`CommandProcessor`) |
| Change default system settings | `Pico/system_config.py` (`DEFAULT_CONFIG`) |
| Change GPIO pin assignments | `Pico/pins.py` |
| Add/modify hardware module | `Pico/<module>.py`, `Pico/hardware.py`, `Pico/process_data.py` |

## Command Protocol Reference

See `Document/API_DOCUMENTATION.md` for the full command list. Key patterns:
- Movement: `FORWARD`, `tFORWARD,N` (timed), `MAIN_FORWARD` (DC motor)
- System: `GET_SYS`, `GET_STATUS`, `SYS_SET,speed,dist,stop,name`, `PING`
- LED: `[v0 v1 v2 v3 v4]`, `LED_ON,num,brightness`, `LED_OFF,num`
- Sensors: `DISTANCE` → `DIST:value`, `MAGNET` → `MAG:value`
- Modules: `GET_MODULES`, `SET_MODULE,name,0/1`, `SET_PIN,name,num`

## Language

Project documentation and code comments are in Korean. UI text targets Korean-speaking elementary school students.
