# Suni (v5)

Proyecto **Suni**: PWA de rutinas, hábitos y propósito de sueño para acompañar el descanso de los niños, junto con el firmware del dispositivo ESP32 que se comunica con la app por Bluetooth (BLE).

## Contenido

- `Suni/` — Aplicación web (PWA): interfaz, CSS, JavaScript, servidor Node con notificaciones push y pruebas.
- `1ESP32_Suni_v2/` — Firmware de Arduino/ESP32 (`.ino` + `sleep_routine.h`).

## Cómo abrirlo

Consulta `Suni/LEEME_PRIMERO.md` y `Suni/README.md`.

- Windows: ejecuta `Suni/ABRIR_SUNI_WINDOWS.bat`
- macOS/Linux: ejecuta `Suni/ABRIR_SUNI_MAC_LINUX.sh`

Después visita `http://127.0.0.1:8099`.

## Fuera del repositorio

`Suni/server/data/` (claves VAPID y base SQLite), `node_modules/` y `.env` no se versionan, según `Suni/.gitignore`.
