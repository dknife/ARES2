# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ARES (Autonomous Rover Exploration System) — an educational robotics project with a block-coding web UI that controls a Raspberry Pi Pico rover over Bluetooth (BLE/UART). Target audience is elementary-school-age children.

## 개발 워크플로 (필수 — 모든 기기 공통)

**git 저장소를 OneDrive 등 클라우드 동기화 폴더 안에 두지 말 것.** OneDrive "파일 온디맨드"가 `.git` 내부 객체를 클라우드 전용 placeholder로 만들어 저장소를 손상시킨 사고가 있었다(2026-06-13: 다운로드 정지 → `.git` 객체 DB 손상, fetch 불가/unresolved delta). 복구는 GitHub에서 OneDrive 밖으로 새 clone 해서 해결했다.

- **개발·버전관리**: 클라우드 밖 로컬 경로에 clone 해서 작업한다(예: macOS `~/Projects/ARES2`, Windows `C:\dev\ARES2`). 기기 간 동기화는 **git push/pull 로만** 한다. origin: `https://github.com/dknife/ARES2.git`
- **새 기기에서 시작할 때도** OneDrive 폴더를 직접 열지 말고, GitHub 에서 새 clone 후 작업한다.
- **개발 저장소(이 clone)가 정본(正本)이다.** Windows 작업 경로 예: `C:\Users\young\MyGitProjects\ARES2`. OneDrive 의 `ARES_Project` 폴더는 2026-06-15 부터 `.git` 을 제거해 **문서·배포 산출물 백업 전용**으로 강등됐다(저장소 아님). 그 폴더에는 코드를 두지 않고 `Document/`·`Build/`·`Papers/` 만 남긴다.
- **OneDrive 에는 최종 결과물만 가끔 작업 파일을 복사**한다(문서·백업·배포용). 복사 시 **`.git` 은 반드시 제외**:
  ```
  rsync -rc --exclude='.git/' --exclude='.DS_Store' <clone>/ "<OneDrive>/.../ARES_Project/"
  ```
  (`--delete` 금지 — OneDrive 에만 있는 `.hwp`/`.pptx` 등 비추적 문서 보존)
- **`Build/` 는 git 에 커밋하지 않는다(.gitignore 처리).** `build.bat`/`build.sh` 로 매번 재생성되는 자동 산출물이며, 배포는 GitHub Releases 압축본·USB 로 한다. 빌드 후 OneDrive `ARES_Project/Build/` 에 복사해 배포용 사본을 최신으로 유지한다. (과거 '저장소에 커밋' 정책은 base64 인라인이 GitHub 100 MB 한도를 위협해 폐기 — `Document/FinalBuild.md` 참고)
- **대형 빌드 산출물(진행보고 PDF)은 커밋 금지 — GitHub Releases 로 공유한다(2026-07-09 절차 변경).** `Document/진행보고/latex/ProgressReport.pdf` 는 `.gitignore` 처리되어 있고, `build.sh` 가 빌드 후 자동으로 Releases `progress-report` 태그 자산으로 갱신한다(수동: `gh release upload progress-report ProgressReport.pdf --clobber`). 고정 공유 링크: `https://github.com/dknife/ARES2/releases/download/progress-report/ProgressReport.pdf` (report.html 히어로에도 링크됨). 매 커밋 52MB PDF 가 히스토리를 불려 Pages 배포가 6~11분씩 걸리던 문제의 해소책.
- **웹 배포는 GitHub Actions Pages 워크플로**(`.github/workflows/deploy-pages.yml`)가 담당한다 — main 푸시 시 대형 원본(latex PDF·Papers 등)을 제외한 사이트를 아티팩트로 배포한다(기존 URL 구조 보존).

## Architecture

Three runtime domains:

1. **Web UI** (`Web/`) — Static HTML/JS using Google Blockly for visual block coding and Web Bluetooth for BLE communication. Entry points: `Web/index.html` (main app/overview), `main.html` (block editor), `dashboard.html` (system monitoring); repo-root `index.html`/`dev.html` are landing pages. A modular Three.js 3D simulation lives in `Web/Sim_Parts/` + `Web/Simulation/`. Uses ES modules (`import`/`export`).
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
| `ui.js` | UI helper functions (button label/state, log toggle, etc.) |
| `simulation.js` | Thin entry that wires the 3D simulation into the page; heavy logic now lives in `Sim_Parts/`/`Simulation/` (legacy monolith preserved in `simulation_backup.js`, do not edit) |

#### 3D Simulation (`Web/Sim_Parts/`, `Web/Simulation/`)

The 3D simulation was refactored from one monolithic `simulation.js` into a modular library. Build/wire it via `Simulation/Simulation_Main.js` (`buildSim`), which delegates to `Sim_Parts/context.js`.

- **`Sim_Parts/`** — the actual subsystem library. `context.js` (`SimContext` — shared state + Three.js scene setup) composes the subsystems: `render.js`, `assets.js` (GLTF loading), `movement.js`, `leds.js`, `gun.js`, `oled.js`, `rocket.js`, `traffic.js`, `waves.js`, `audio.js` (`AudioSynthesizer`), `editor_controls.js`. `dispatch.js` (`CommandDispatcher`) parses command strings → simulated effects (`applyTopicEffect`/`simSink`). `topics.js` defines scene topics (albi/traffic/launchpad/rover), OLED icons, palette.
- **`Simulation/`** — thin subsystem wrappers/orchestrators over `Sim_Parts/`: `Simulation_Main.js` (orchestrator, re-exports `buildSim`/topics/audio), `Simulation_Launcher.js`, `Simulation_Rover.js`, `Simulation_Traffic.js`, `Simulation_AresRobot.js`.

#### HTML Entry Points

| File | Role |
|------|------|
| `index.html` (repo root) | Public landing page for the project |
| `dev.html` (repo root) | Developer landing page |
| `Web/index.html` | Main app (코리아사이언스 화성 탐사선) — mission/overview + 3D hero; `?mobile=true` previews mobile layout on desktop |
| `Web/main.html` | Blockly block editor |
| `Web/dashboard.html` | System monitoring dashboard |

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
- **Do not modify** legacy/backup files (`Pico/backup/`, `Web/simulation_backup.js`)

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
- LED: `[v0 v1 v2 v3 v4 v5]` (6개), `LED_ON,num,brightness`, `LED_OFF,num`
- Sensors: `DISTANCE` → `DIST:value`, `MAGNET` → `MAG:value`
- Modules: `GET_MODULES`, `SET_MODULE,name,0/1`, `SET_PIN,name,num`

## Language

Project documentation and code comments are in Korean. UI text targets Korean-speaking elementary school students.
