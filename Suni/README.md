# Suni — versión de trabajo integrada (22 oct 2026)

Se conservan los recursos originales y el proyecto HTML/CSS/JS. Se ha consultado
el Figma actualizado por Composio: contiene 10 frames en la página «Frames Suni»,
con frames de 420 × 912 px, incluidos los estados 5.1, 5.2 y 7.1.
**La comparación visual píxel a píxel y la incorporación de todos los nuevos
estados del Figma todavía no se han completado.**

Cambios de esta entrega:
- Contraste aumentado en las barras activas de volumen.
- Firmware de prueba separado: umbral LDR 4070 ±10 (provisional),
  temporizador de teléfono 30 segundos, apagado prioritario cuando no hay
  celular, lámpara encendida cuando se detecta el celular fuera de la
  rutina de sueño, parpadeo conservado durante la hora previa a dormir.
- El firmware original permanece disponible en el ZIP aportado por el usuario.

**Importante:** las lecturas LDR 4050/4095 están prácticamente saturadas.
Esta calibración es experimental, no garantiza distinguir verde/azul. Revisar
el divisor resistivo, aislamiento óptico, conexiones MOSFET y polaridad.
El hardware no ha sido probado ni se ha compilado el firmware en una placa.

Para probar la web localmente desde `Suni`:
`python -m http.server 8099 --bind 127.0.0.1`.
Para notificaciones push reales usar `npm install` y `npm start` con
configuración de servidor/HTTPS y permisos del teléfono; no se garantizan
notificaciones con la web cerrada en todos los navegadores.
BLE requiere navegador compatible y contexto seguro.

---

# Suni — réplica del diseño de Figma + integración con el ESP32

## Actualización funcional

La aplicación conserva HTML/CSS/JavaScript y los recursos originales. `css/mobile.css`
adapta la composición a un marco de referencia de 390 × 844 y al ancho del teléfono;
`js/functional.js` implementa formularios y perfil local.

- **Perfil local, no autenticación:** registro, acceso por usuario/correo y edición en
  este navegador. No se guardan contraseñas ni existen cuentas en un servidor.
- Los tres propósitos se pueden escribir y conservar hasta su próxima edición.
- Horarios, sonido y volumen se conservan localmente. Hábitos permite desplazarse
  hasta los siete días y Guardar. Guardar en Buddi ahora es visible.
- El registro lleva a Inicio según `transitionNodeID` del nodo original.
- BLE usa una cola única y espera las respuestas del firmware. Los avisos distinguen
  configuración local y confirmada. Ante fallos se requiere reconectar.
- El modo `?mock` ha sido deshabilitado: no representa enlaces físicos simulados.
- El archivo `.ino` no se ha modificado. Pruebas físicas de BLE, alarma, LDR,
  lámpara y volumen quedan pendientes con el dispositivo real.

Ejecutar desde `Suni`: `python -m http.server 8099 --bind 127.0.0.1` y abrir
`http://127.0.0.1:8099`. Para acceso BLE desde un teléfono, publicar por HTTPS.
Chrome Android admite Web Bluetooth; Safari iPhone no. El reloj del firmware y
su configuración se pierden al reiniciar el ESP32.

Verificaciones actuales: sintaxis JavaScript, carga de recursos, marco 390 × 844,
desplazamiento de Hábitos, registro local y navegación a Inicio en navegador.
Se comprobaron anchos de 320, 360, 390 y 430 px sin desbordamiento horizontal,
y acceso a Guardar de Hábitos. Una prueba aislada del transporte verificó la
serialización de escrituras y confirmaciones; no constituye prueba de hardware.
La comparación visual exhaustiva con Figma y las pruebas en teléfonos físicos
siguen pendientes.

**El contenido siguiente es documentación histórica de la extracción inicial.**
Sus referencias a simulación, volumen no persistido, campos visuales o resultados
de pruebas anteriores no describen ni certifican la versión actual.

Réplica funcional, en **HTML/CSS/JS puros** (sin dependencias ni paso de compilación), de los
**7 frames** del archivo [`Suni`](https://www.figma.com/design/ynpBW0GgSrCaagt5TbkH5B/Suni?node-id=95-3394),
reproduciendo componentes, estilos, posiciones y **acciones del prototipo** con sus duraciones y
easings exactos (cada reacción se verificó nodo a nodo contra el campo `interactions` de la API
de Figma).

Además, la interfaz está **cableada al firmware real** (`1ESP32_Suni_v2.ino`): la página fija la
hora y el día del dispositivo desde el navegador, envía el horario semanal de «Mis hábitos», el
sonido y el volumen de «Configura tu Buddi», y **enciende el botón de Bluetooth solo cuando hay
enlace de verdad** con el ESP32 (ver sección *Integración con el ESP32*).

## Cómo verlo

Abre la página servida por HTTP en **Chrome o Edge** (Web Bluetooth exige un contexto seguro y
`file://` no siempre lo ofrece):

```
python -m http.server 8099 --bind 127.0.0.1
# → http://127.0.0.1:8099/index.html
```

Sin el dispositivo a mano, añade `?mock=1` para simular el ESP32 y recorrer toda la
interfaz (la app envía igualmente todos los comandos y los registra en la consola):

```
http://127.0.0.1:8099/index.html?mock=1
```

El prototipo se muestra en un **único dispositivo de 420 × 912 px** (medida exacta del frame de
Figma), centrado en la página. Todas las pantallas se intercambian dentro de ese marco.

## Pantallas (frame de Figma → pantalla)

| # | Frame | Id de nodo | Pantalla |
|---|-------|-----------|----------|
| 1 | Splash | `331:7579` | `splash` |
| 2 | Iniciar sesión | `377:429` | `login` |
| 3 | Crear Cuenta Nueva | `95:3388` | `registro` |
| 4 | Home | `95:3394` | `home` |
| 5 | Mis hábitos | `95:3431` | `habitos` |
| 6 | Configura tu Buddi | `95:3435` | `buddi` |
| 7 | Mi Cuenta y Perfil | `406:7770` | `perfil` |

## Acciones del prototipo

### Transiciones (medidas del campo `interactions`)

| Transición | Duración | Easing | Nodos verificados |
|---|---|---|---|
| `DISSOLVE` | 300 ms | Ease in (`0.42,0,1,1`) | «Ingresar» login → home (`377:431`, `MOUSE_UP`) |
| `SLIDE_IN` | 400 ms | Ease out (`0,0,0.58,1`) | Splash «Inicia Sesión»/«Regístrate» (`580:3625`/`582:3631`, `ON_CLICK`) · Home → Buddi (`95:3396`, `MOUSE_UP`) · Home → Perfil (`95:3397`, `ON_CLICK`) |
| `SLIDE_IN` | 400 ms | Ease in (`0.42,0,1,1`) | Home → Hábitos (`95:3395`, `MOUSE_UP`) · Registro «Registrarse» (`95:3390`, `ON_CLICK`) |
| `SLIDE_OUT` | 400 ms | Ease in (`0.42,0,1,1`) | Flechas «volver»: splash `557:3597` · hábitos `95:3433` · buddi `207:5493` · perfil `406:7784` (todas `MOUSE_UP`) |
| `CHANGE_TO` | 300 ms | Ease out | Variantes *hover*/*pressed* de «Botón», flecha y nav: **transición heredada del set** (`transitionDuration=300`/`EASE_OUT` en `18:1176`, `291:7484`, `47:3188`, `47:3259`) |
| `CHANGE_TO` | 300 / 400 ms | Ease out | Filas de hábitos, **asimétricas**: entrada `ON_HOVER` → `261:6481` con `SMART_ANIMATE` 300 ms (`261:6460`) y salida `MOUSE_LEAVE` → `261:6460` con 400 ms (`261:6481`) |
| `CHANGE_TO` | 400 ms | Ease out | Bluetooth: `MOUSE_UP` → conectado (`337:7623` → `337:7608`, `SMART_ANIMATE` 400 ms) |
| `CHANGE_TO` | 500 ms | Ease in and out | Campos/propósitos: el set hereda 500 ms (`497:1188`); el cursor cicla `497:1188` ⇄ `497:1222` mediante dos `AFTER_TIMEOUT` |

### Destinos completados

En el archivo original **todos los `NAVIGATE` traían `destinationId: null`**. Para que todas las
pantallas sean alcanzables se completaron con el destino lógico:

| Origen | Elemento | Nodo | Destino completado |
|---|---|---|---|
| Splash | «Inicia Sesión» | `580:3625` | Login · `SLIDE_IN` 400 ms ease out |
| Splash | «Regístrate» | `582:3631` | Crear cuenta · `SLIDE_IN` 400 ms ease out |
| Splash | Flecha | `557:3597` | Login · `SLIDE_OUT` 400 ms ease in |
| Login | «Ingresar» | `377:431` | Home · `DISSOLVE` 300 ms ease in |
| Login | Flecha | — | Splash · `SLIDE_OUT` |
| Registro | «Registrarse» | `95:3390` | Login · `SLIDE_IN` 400 ms ease in |
| Registro | Flecha | — | Splash · `SLIDE_OUT` |
| Home | «Botón Rutina» | `95:3395` | Mis hábitos · `SLIDE_IN` 400 ms ease in |
| Home | «Botón Suni Buddi» | `95:3396` | Buddi · `SLIDE_IN` 400 ms ease out |
| Home | «Botón usuario» | `95:3397` | Mi Cuenta · `SLIDE_IN` 400 ms ease out |
| Mis hábitos | Flecha | `95:3433` | Home · `SLIDE_OUT` |
| Mis hábitos | «Guardar» | — | Home · `DISSOLVE` |
| Buddi | Flecha | `207:5493` | Home · `SLIDE_OUT` |
| Buddi | «Guardar» | `95:3447` | En Figma queda **cubierto por el panel 21** (así aparece en el render): se conserva el nodo en el marcado, pero no navega |
| Perfil | Flecha | `406:7784` | Home · `SLIDE_OUT` |
| Perfil | «Guardar Cambios» | `406:7776` | Home · `DISSOLVE` |
| Perfil | «Cambiar Contraseña» | `429:728` | Alterna mostrar/ocultar la contraseña (acción lógica: el nodo no define reacción) |
| Perfil | «Editar» | — | Enfoca el primer campo (acción lógica: el nodo no define reacción) |

### Interacciones de estado (variantes `CHANGE_TO`)

* **Caras del Home** (`47:2916` / `47:2901` / `39:2856`):
  `MOUSE_DOWN` → variante «¿Qué propósitos tienes este día?»
  (`252:5798` / `252:5823` / `242:5707`); `MOUSE_UP` → `606:3678` (feliz) / `606:3656` (normal)
  o vuelve al defecto (`39:2837`). Cruces entre caras según la tabla de variantes; fundido
  `SMART_ANIMATE` 300 ms ease out.
* **Guardar propósitos**: la tarjeta entra en la variante «Cambios guardados» (sprites
  `saved-*`) y el aviso se retira solo tras **2500 ms** (`AFTER_TIMEOUT` completado) dejando
  «Tus propósitos» (`done-*`); «Editar» vuelve a la cara.
* **Celdas de la cuadrícula**: selección exclusiva; la celda activa crece de 39×141 a
  54×175,54 con fondo blanco translúcido, escala su contenido ×1,15 y el nombre del día pasa
  a opacidad 100 % (el nombre se dibuja con texto real, no queda horneado en la imagen).
* **Bluetooth** (`337:7623` ↔ `337:7608`): el estado visual es el **estado real del enlace**
  con el ESP32 (no un conmutador): el clic conecta/desconecta por Web Bluetooth y la clase
  `is-on` se aplica solo cuando hay enlace (`aria-pressed` sincronizado). Arranca
  **desconectado**, como el render del diseño.
* **Botones de sonido** (`291:7484` y otros): conservan el `ON_HOVER` → `47:3059` y el
  `ON_PRESS` → `47:3063` del prototipo y, como ampliación funcional, el clic elige el sonido
  real de la alarma (`SETSOUND=<slug>`) dejando el chip marcado (`is-selected`) y persistido.
* **Filas de hábitos** (`261:6460`/`261:6481`): variante *hover* con entrada de 300 ms y
  salida de 400 ms; **cajas de hora** (`261:7011`): variante *hover* y ahora **editables**:
  un `input[type=time]` invisible cubre los chips y abre el selector nativo del navegador sin
  alterar el diseño; al cambiar se actualizan los chips, la tarjeta del home y el horario.
* **Barra de sonido**: `DRAG` → fija el nivel (`MOVE_IN` 300 ms) sobre 50 barras; también
  responde a flechas de teclado (±5 %). Al soltar envía `SETVOLUME=0..100`.

## Integración con el ESP32 (firmware v2)

La interfaz habla por **Bluetooth Low Energy** con el sketch
`C:\Users\alexa\OneDrive\Documents\Arduino\1ESP32_Suni_v2\1ESP32_Suni_v2.ino`
(carpeta propia: Arduino compila todos los `.ino` de una carpeta como un mismo sketch).
Servicio `12345678-1234-1234-1234-1234567890ab`, característica
`abcd1234-ab12-cd34-ef56-abcdef123456`, nombre del dispositivo `ESP32_alarma_ble`.

### Protocolo (comandos ≤ 20 bytes, uno por escritura)

| Comando | Quién lo envía | Efecto en el ESP32 |
|---|---|---|
| `SETTIME=HH:MM:SS` | `ble.js`, al conectar y **cada 30 s** | Fija la hora desde el navegador (única fuente de tiempo) |
| `SETDAY=1..7` | ídem | Fija el día ISO 8601 (1 = lunes … 7 = domingo) |
| `SETALARM=d,HH:MM` | «Mis hábitos» (Guardar o al conectar) | Alarma del día `d` (la hora **am** de la fila) |
| `SETSLEEP=d,HH:MM` | ídem | Hora de dormir del día `d` (la hora **pm**): 60 min antes la lámpara enciende 1 min de cada 5, con fundido |
| `SETSOUND=clasico\|pajaro\|rio\|digital` | chip de «Elige tu sonido» | Sonido de la alarma |
| `SETVOLUME=0..100` | barra de «Volumen De Alarma» | Volumen (al soltar el arrastre o con flechas) |
| `STATUS` · `STOP` · `TEST` | — | Estado · parar alarma · prueba de sonido |

El dispositivo responde por notificación (`READY` al conectar, confirmaciones cortas de cada
comando) y la app las muestra en la región de avisos accesible `#ble-status`.

### Qué controla cada pantalla

| Pantalla | Control | Comando |
|---|---|---|
| Configura tu Buddi | Botón junto a «Conexión Bluetooth» | Clic = conectar/desconectar; **se enciende solo con enlace real** (`is-on`), pulsa mientras conecta (`is-connecting`) |
| Configura tu Buddi | Barra de volumen | `SETVOLUME` |
| Configura tu Buddi | 4 chips de sonido | `SETSOUND` + estado marcado y persistente |
| Mis hábitos | Hora **am** de cada día (editable con el selector nativo de hora) | `SETALARM=d,HH:MM` |
| Mis hábitos | Hora **pm** de cada día | `SETSLEEP=d,HH:MM` |
| Mis hábitos | «Guardar» | Envía los **14 comandos** del horario (7 almas + 7 dormires) |
| Home | Tarjeta «Tus alarmas» | Muestra el mismo horario de «Mis hábitos» |

El horario, el sonido y el volumen quedan en `localStorage` y se **reenvían solos al conectar**
(`SuniBLE.onConectar`).

### Flujo de arranque del firmware

1. La app detecta el dispositivo por prefijo de nombre y se suscribe a la característica.
2. El ESP32 notifica `READY`; la app manda hora+día y luego sonido, volumen y horario.
3. A partir de ahí la alarma del día, la ventana de luz previa al `pm` y el temporizador
   anti-sobre-cama (5 min con el teléfono sobre el LDR) funcionan **aunque la app se cierre**.
4. Si vuelve la app, re-sincroniza hora cada 30 s (deriva del reloj del ESP32 < 2 s/hora).

### Compilar y subir el firmware

Con Arduino IDE (el core **esp32 3.3.12** ya está instalado) o con `arduino-cli`:

```
arduino-cli compile --fqbn esp32:esp32:esp32 "…\Arduino\1ESP32_Suni_v2"
arduino-cli upload  --fqbn esp32:esp32:esp32 --port COMx "…\Arduino\1ESP32_Suni_v2"
```

La telemetría WiFi del sketch original queda como `#define SUNI_TELEMETRIA_WIFI 0` (opcional;
si se activa hay que usar la partición `huge_app`). Con ella desactivada el binario ocupa
**1 122 626 bytes (85 %)** de la partición estándar y compila sin errores ni avisos.

## Fidelidad al diseño

* Geometría **medida directamente** de los `absoluteBoundingBox` de Figma: las posiciones y
  tamaños de los elementos se verificaron numéricamente contra el archivo original y coinciden
  (los anchos de texto desviados menos de 0,5 px, lo que confirma los tamaños tipográficos).
* Paleta y rellenos muestreados píxel a píxel sobre los renders exportados de Figma:
  gradiente cálido `#FAE8C4 21,15 % → #FACB6D 60,36 % → #E2BB6E 100 %`,
  gradiente de perfil `#F9DEA6 52,4 % → #DBE3F4 90,87 %`, «Botón» `rgba(142,159,163,.20)`,
  botones del perfil `rgba(44,96,27,.46)`, campos `rgba(154,111,49,.30)` sobre `rgba(0,0,0,.20)`
  con brillo interior `inset 0 1px 5px rgba(255,251,226,.20)`, etc.
* Tipografía **Roboto** (400/500/700/800) con las métricas de Figma: títulos 25/29,
  «Tus alarmas» 20/23, etiquetas y botones 20/23, celdas 15/18 en negrita, «am»/«pm» 8/9.
* Radios: botones y campos 20, tarjetas con radio superior 20 y **paneles de Buddi con radio
  superior 18** (ajuste por círculo contra 7 puntos del arranque de color en el render).
* Los efectos de Figma (sombra de botón `0 0 3px rgba(0,0,0,.10)` con
  `showShadowBehindNode:false`, el *rim* claro del vidrio, sombra de tarjeta
  `0 0 4px rgba(0,0,0,.15)` + interior `inset 0 -1px 0 rgba(0,0,0,.10)`, sombra de texto
  `0 4px 4px rgba(0,0,0,.25)`) están replicados en CSS.

### Nota sobre la NOISE de Buddi

Los paneles de la pantalla Buddi llevan una textura de ruido que **oscurece todo el grupo
compuesto ~12,5 %** (factor medido ×0,875 con dos muestras independientes:
`#FFFCE2 → #DFDDC6` en los títulos y `#808244 → #70723C` en el borde). Todos los colores que
caen dentro de esos grupos van **horneados ×0,875** en `tokens.css`: degradados de los paneles,
títulos, texto de los chips (`--c-sound` `#653C00`), píldora del Bluetooth (`#64643D`), vidrio
de los chips y barra de sonido. El ícono `bt-face.png` se recoloreó a `#D08A04` (equivalente a
`#ea9f08` al 50 % sobre la píldora).

### Nota sobre la barra de sonido

`Group 18` (`291:7522`) mide 297×35 en rel(6,3): son **50 barras** de 3 px con paso 6 (la 50.ª
acaba en x=303); las rayas terminan antes del logo de sonido, que va sobre fondo liso, y el
logo va atenuado (`brightness(.74)`) para igualar la media del render.

### Nota sobre el frame de registro

El contenido del frame llega hasta y=1217 y desborda el viewport de 912 px. Se reprodujo esa
altura completa con **desplazamiento interno** y el **gradiente se pinta sobre los 1258 px del
frame** (en la hoja), de modo que sus paradas caen exactamente donde caen en Figma
(`#FAE6BE`@300 · `#FADEA4`@450 · `#F3C76D`@900).

### Nota sobre la cuadrícula

En Figma la cuadrícula es un componente con variantes horneadas como imagen. Aquí se **construye
en CSS** (flex, celdas 39×141, celda activa 54×175,54, radio 10) usando los iconos de sol/luna
exportados y texto real, para que la selección de día sea una interacción auténtica y no un
cambio de imagen fija.

## Verificación

Cada pantalla se comparó **píxel a píxel** contra el render exportado de Figma (420×912;
el frame de registro, 420×1258 recortado al viewport). Umbral: desviación media por píxel
(suma de |ΔR|+|ΔG|+|ΔB|) y % de píxeles con desviación > 60:

| Pantalla | Desviación media | Píxeles > 60 |
|---|---|---|
| login | 3,23 | 0,44 % |
| registro | 4,07 | 0,94 % |
| splash | 4,21 | 1,57 % |
| home | 8,03 | 3,19 % |
| perfil | 8,19 | 3,51 % |
| buddi | 10,00 | 1,74 % |
| hábitos | 10,44 | 3,63 % |

El residuo se concentra en el **texturizado NOISE** de Figma (grano que no puede
reproducirse en CSS) y en el re-muestreo de las capturas (DPR 1,25 → 420×912). Los bordes de
texto quedan como contornos de 1 px.

Además, **24 flujos de interacción** se verificaron con clics reales en el navegador: los 7
caminos de navegación, la selección exclusiva de la cuadrícula, la máquina de estados de la
tarjeta (cara → propósitos → guardado → aviso que se retira a los 2500 ms → edición), el
Bluetooth, la barra de sonido por teclado y por arrastre y los chips de sonido.

Con la integración BLE se verificaron también, en modo simulado (`?mock=1`) y con consola sin
errores: la conexión enciende el botón (`is-on`, `aria-pressed="true"`, `READY` recibido), el
envío automático de `SETTIME`+`SETDAY` (dos ciclos de 30 s observados) y del empuje completo
(sonido, volumen y **14 comandos** de horario), el clic de un chip (`SETSOUND=pajaro` +
persistencia), el arrastre de la barra al 50 % (`SETVOLUME=50`, 25 barras apagadas), la
edición de la hora am del lunes a 07:30 (chips `07:30`, celda del home `7:30`, guardado en
`localStorage`), «Guardar» de Mis hábitos reenviando `SETALARM=1,07:30`… y la recarga de la
página conservando horario y sonido con el botón apagado.

## Estructura

```
Suni/
├─ index.html          Las 7 pantallas del prototipo
├─ css/
│  ├─ tokens.css       Variables (paleta, gradientes, efectos, movimiento) + marco del dispositivo
│  ├─ components.css   Componentes de Figma: Botón, campo, flecha, nav, caras, celdas, filas…
│  └─ screens.css      Posicionado absoluto de cada pantalla con las coordenadas de Figma
├─ js/
│  ├─ interactions.js  Motor de transiciones (Fx) + tabla de reacciones y destinos
│  ├─ ble.js           Puente Bluetooth LE con el ESP32 (Web Bluetooth + modo simulado)
│  └─ app.js           Cableado de las interacciones, horario semanal y arranque
└─ assets/             63 PNG exportados del propio archivo Figma (ver procedencia abajo)
```

## Procedencia de los assets

Los PNG de `assets/` se exportaron del propio archivo Figma a la mayor escala disponible
(×3 y ×4) mediante la API de Figma, conservando los **render bounds** (es decir, incluyen las
sombras que el nodo dibuja fuera de su caja). Por eso algunas imágenes se posicionan unos
píxeles antes que su `absoluteBoundingBox`:

| Asset | Tamaño render | Desplazamiento |
|---|---|---|
| `suni-pregunta.png` | 369×312 | (25,147) |
| `face-*-pressed.png` (variante «propósitos») | 375×316 | (22,145) |
| `nav-*.png` | 71×71 | (−3,−3) sobre la caja 65×65 |
| `back-chevron.png` | 51,3×51,3 | (−3,33,−3,33) sobre la caja 46×46 |
| `bt-*.png` | 45×38 | (−2,−2) sobre la caja 41×34 |
| `sound-bar.png` | 342×47 | (−3,−3) sobre la caja 336×41 |
| `face-*-hover.png` | 69×65 | centradas sobre la caja 60×56 |
| `cara-sonrisa`, `suni-splash`, `green-panel`, `cloud-*`, `pillow`, `icon-*` | — | coinciden con la caja |

## Árbol de interacción completo

```
splash ──«Inicia Sesión»──▶ login ──«Ingresar»──▶ home
        ──«Regístrate»────▶ registro ──«Registrarse»──▶ login
                                   │
        (flecha «volver» en splash, login, registro → pantalla anterior)

home ──«Botón Suni Buddi»──▶ buddi ──flecha──▶ home
     ──«Botón Rutina»─────▶ hábitos ──flecha / «Guardar»──▶ home
     ──«Botón usuario»────▶ perfil ──flecha / «Guardar Cambios»──▶ home```

Todas las pantallas son alcanzables desde la interfaz, sin necesidad de recargar.
