# Suni: instrucciones para abrir la aplicación

## Windows
1. Descomprime el ZIP (clic derecho > Extraer todo).
2. Abre la carpeta `Suni`.
3. Haz doble clic en `ABRIR_SUNI_WINDOWS.bat`.
4. Si no se abre el navegador, visita http://127.0.0.1:8099.
5. Mantén abierta la ventana negra mientras uses Suni.

Requiere Python 3. Alternativa en terminal dentro de `Suni`:
`py -3 -m http.server 8099 --bind 127.0.0.1`.

## Mac y Linux
En terminal, dentro de `Suni`, ejecuta:
`python3 -m http.server 8099 --bind 127.0.0.1`
Abre http://127.0.0.1:8099.

## Importante
- `localhost` NO es un sitio web público. Solo funciona después de ejecutar el servidor en tu computadora.
- `localhost` en un celular apunta al celular, no a tu computadora. Para Web Bluetooth móvil debes publicar bajo HTTPS.
- La interfaz puede previsualizarse localmente. Notificaciones push con la web cerrada requieren un servidor HTTPS público, con `npm install` y `npm start`, configurado y encendido.
- La aplicación guarda perfil y horarios localmente; no es un servicio de cuentas remotas.
- El firmware de desarrollo está en `1ESP32_Suni_v2/`; NO se ha probado en el dispositivo físico. La calibración LDR 4070 ±10 es provisional.
- Pruebas automatizadas completas: instalar Node >=24 y ejecutar `npm install` y `npm test` dentro de `Suni`. Las pruebas de horario aisladas pueden correr con `node --test tests/schedule.test.cjs`.
