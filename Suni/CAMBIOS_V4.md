# Suni v4 — cambios específicos

- Propósitos: al editar se escribe directamente sobre los tres campos existentes de Figma (sin nuevos fondos).
- Al guardar, los tres valores quedan en las tres barras del sprite guardado, alineados con las posiciones originales. Se quitaron los textos de muestra incrustados en las imágenes `done-*` y `saved-*`.
- El botón Editar conserva el texto dibujado por Figma y sigue siendo interactivo.
- Nubes de Mis hábitos: las cuatro cruzan el frame de derecha a izquierda, en la misma dirección, con separación temporal y alturas distintas.
- Se respetan las preferencias del sistema de movimiento reducido.
- Se conserva el firmware ESP32 sin cambios.

Para ver los cambios: cierra el servidor anterior, ejecuta `ABRIR_SUNI_WINDOWS.bat`, y fuerza la recarga del navegador con Ctrl+Shift+R. Si ya había propósitos guardados, se mantienen en localStorage.
