# Actualización de Suni — 22 octubre 2026

- Marco de teléfono visible en pantallas de escritorio; en teléfonos se usa el ancho real de pantalla.
- Paleta de fondos sincronizada con los gradientes consultados en Figma: `#FAE8C4`, `#FEBF6D`, `#E2BB6E`.
- Diálogo de notificaciones de Mis hábitos: solo en el primer Guardar de ese navegador. El indicador se guarda en `localStorage` con la clave `suni.notifications.firstSavePrompted.v1`. No se repite tras cerrar, aceptar, rechazar o recargar.
- No se presenta un botón permanente de permiso: si se rechazó, se administra desde los ajustes del navegador.
- El aviso del navegador depende de Push real (HTTPS, Service Worker, servidor configurado). En previsualización local puede no funcionar.
- El firmware ESP32 no se modificó.

## Abrir en Windows
Descomprime y ejecuta `Suni/ABRIR_SUNI_WINDOWS.bat` con Python 3 instalado. Después visita `http://127.0.0.1:8099` si no se abre automáticamente. Cierra el servidor anterior antes de iniciar uno nuevo.
