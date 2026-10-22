/* =========================================================================
   Suni · app.js
   Cableado de las interacciones del prototipo contra el archivo Figma
   "Suni" (2026-10-21).

   Reproduce las reacciones de los 7 frames:

     · Splash   ON_CLICK de los Botón → NAVIGATE (SLIDE_IN 400 EASE_OUT)
                Flecha (MOUSE_UP) → SLIDE_OUT 400 EASE_IN LEFT
     · Login    MOUSE_UP de "Ingresar" → DISSOLVE 300 EASE_IN
                MOUSE_UP de los Cuadro de texto → variante enfocada
     · Registro ON_CLICK de "Registrarse" → SLIDE_IN 400 EASE_IN
     · Home     Caras: SMART_ANIMATE 300 EASE_OUT entre variantes
                  · desde el defecto: feliz/normal lo abren al soltar,
                    triste lo muestra mientras se mantiene pulsada
                  · dentro: los clics cambian la cara elegida
                  · Guardar → "Tus propósitos de hoy" (variante destino nula)
                Cuadrícula: CHANGE_TO de la celda seleccionada
                Botones: SLIDE_IN 400 (EASE_OUT buddi/usuario · EASE_IN rutina)
     · Hábitos  Nubes: AFTER_TIMEOUT (0.001s / 5s) + SMART_ANIMATE 10s
     · Buddi    Bluetooth MOUSE_UP → SMART_ANIMATE 400 EASE_OUT
                Barra de sonido DRAG → MOVE_IN 300 EASE_OUT
     · Perfil   Botones y enlaces con feedback de variante
   ========================================================================= */

(() => {
  'use strict';

  const SMART = 'opacity 300ms cubic-bezier(0,0,.58,1)';

  /* ---------------------------------------------------------------
     1 · NAVEGACIÓN POR DATA-ACTION (tabla Fx.NAV)
     --------------------------------------------------------------- */
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const entry = Fx.NAV[el.dataset.action];
      if (entry) Fx.goTo(entry[0], entry[1]);
    });
  });

  /* ---------------------------------------------------------------
     2 · HOME — Máquina de estados de la tarjeta "Suni pregunta"
     Estados: default · triste · normal · feliz (entrar propósitos)
              · saved-* ("Cambios guardados") y done-* ("Tus propósitos")
     --------------------------------------------------------------- */
  const suni = document.getElementById('suni');
  const imgs = {};
  let state = 'default';
  let zTop = 2;
  let cleanupTimer = 0;
  let badgeTimer = 0;

  suni.querySelectorAll('.suni__img').forEach(img => { imgs[img.dataset.stateImg] = img; });

  /* Normaliza las capas: solo la activa queda opaca arriba del todo */
  Object.entries(imgs).forEach(([key, img]) => {
    img.hidden = false;
    img.style.transition = 'none';
    img.style.opacity = key === state ? '1' : '0';
    img.style.zIndex = key === state ? '2' : '1';
  });
  void suni.offsetWidth;

  /* SMART_ANIMATE 300ms EASE_OUT: fundido cruzado entre variantes */
  function setSuniState(next) {
    if (next === state || !imgs[next]) return;
    const incoming = imgs[next];

    /* Si la imagen de destino aún está visible debajo, basta con
       promoverla; si no, se funde desde 0.                              */
    if (parseFloat(getComputedStyle(incoming).opacity) < 0.99) {
      incoming.style.transition = 'none';
      incoming.style.opacity = '0';
      incoming.style.zIndex = String(++zTop);
      void incoming.offsetWidth;
      incoming.style.transition = SMART;
      incoming.style.opacity = '1';
    } else {
      incoming.style.zIndex = String(++zTop);
    }

    state = next;
    suni.dataset.state = next;

    clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
      Object.entries(imgs).forEach(([key, el]) => {
        if (key !== state) { el.style.opacity = '0'; el.style.zIndex = '1'; }
      });
    }, 340);
  }

  /* Transiciones confirmadas en Figma (variantes de 39:2836) --------- */
  function faceDown(name, from) {
    if (from === 'default') {
      /* MOUSE_DOWN → 242:5707 solo para la cara triste */
      if (name === 'triste') setSuniState('triste');
    } else if (from === 'triste') {
      if (name === 'feliz') setSuniState('feliz');
      else if (name === 'normal') setSuniState('normal');
    } else if (from === 'normal') {
      if (name === 'feliz') setSuniState('feliz');
      else if (name === 'triste') setSuniState('triste');
    } else if (from === 'feliz') {
      if (name === 'normal') setSuniState('normal');
      else if (name === 'triste') setSuniState('triste');
    }
  }

  function faceUp(name, from) {
    if (from === 'default') {
      /* MOUSE_UP → 606:3678 (feliz) / 606:3656 (normal) */
      if (name === 'feliz' || name === 'normal') setSuniState(name);
    } else if (from === 'triste' && name === 'triste') {
      /* MOUSE_UP → 39:2837: soltar la cara triste vuelve al defecto */
      setSuniState('triste');
    }
  }

  suni.querySelectorAll('.face').forEach(face => {
    const name = face.dataset.face;

    face.addEventListener('mousedown', () => faceDown(name, state));
    face.addEventListener('mouseup',   () => faceUp(name, state));
    face.addEventListener('touchstart', e => { e.preventDefault(); faceDown(name, state); }, { passive: false });
    face.addEventListener('touchend',   e => { e.preventDefault(); faceUp(name, state); },   { passive: false });

    /* Lectores de teclado: keydown = pulsar, keyup = soltar */
    face.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faceDown(name, state); }
    });
    face.addEventListener('keyup', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faceUp(name, state); }
    });
  });

  /* Cajas de propósitos: MOUSE_UP → variante enfocada (497:1222) */
  const goalInputs = Array.from(suni.querySelectorAll('[data-goal-input]'));
  goalInputs.forEach(input => {
    input.addEventListener('click', () => {
      const was = input.classList.contains('is-focused');
      goalInputs.forEach(i => i.classList.remove('is-focused'));
      if (!was) input.classList.add('is-focused');
    });
  });

  /* "Guardar" (destino nulo en Figma) → variante "Tus propósitos de hoy" */
  suni.querySelector('[data-goal-save]').addEventListener('click', () => {
    const face = state === 'triste' || state === 'normal' ? state : 'feliz';
    goalInputs.forEach(i => i.classList.remove('is-focused'));
    /* Guardar → variante "Cambios guardados" (247:5724 · 252:5763 ·
       252:5780); el aviso se retira solo (AFTER_TIMEOUT completado con
       2500 ms) dejando la variante "Tus propósitos" sin aviso.        */
    setSuniState(`saved-${face}`);
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      if (state === `saved-${face}`) setSuniState(`done-${face}`);
    }, 2500);
  });

  /* "Editar" (606:3717 → 606:3678): vuelve a la tarjeta de propósitos.
     Actúa igual desde "Tus propósitos" como desde el aviso guardado.    */
  suni.querySelector('[data-goal-edit]').addEventListener('click', () => {
    const face = state.replace('done-', '').replace('saved-', '');
    setSuniState(face);
  });

  /* Vista semanal de solo lectura: la fecha actual se resalta sin clics. */
  const grid = document.getElementById('grid');
  function resaltarHoy() {
    if (!grid) return;
    const hoy = (new Date().getDay() + 6) % 7;
    grid.querySelectorAll('.cell').forEach((cell, i) => {
      cell.classList.toggle('is-selected', i === hoy);
      cell.setAttribute('aria-current', i === hoy ? 'date' : 'false');
      cell.removeAttribute('aria-pressed');
      cell.disabled = true;
      cell.tabIndex = -1;
    });
  }
  resaltarHoy();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resaltarHoy(); });

  /* ---------------------------------------------------------------
     4 · CAMPOS DE TEXTO — MOUSE_UP → variante enfocada (497:1188)
     Un solo campo enfocado por pantalla.
     --------------------------------------------------------------- */
  document.querySelectorAll('.field').forEach(field => {
    const box = field.querySelector('.field__box');
    const focus = () => {
      const screen = field.closest('.screen');
      screen.querySelectorAll('.field.is-focused').forEach(f => f.classList.remove('is-focused'));
      field.classList.add('is-focused');
    };
    box.addEventListener('click', focus);
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(); }
    });
  });

  /* ---------------------------------------------------------------
     5 · HÁBITOS — Horario semanal (95:3431)
     Cada fila trae la hora "am" (→ alarma del ESP32) y la "pm"
     (→ hora de dormir; los 60 minutos previos la lámpara enciende
     1 minuto de cada 5). Los chips son editables con el selector
     nativo de hora, el horario vive en localStorage y "Guardar" lo
     envía al dispositivo con SETALARM=d,HH:MM / SETSLEEP=d,HH:MM.
     --------------------------------------------------------------- */
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const HORARIO_CLAVE = 'suni.horario';
  const HORARIO_DEFECTO = { am: 8 * 60, pm: 23 * 60 };   /* 08:00 am · 11:00 pm */

  const pad = n => String(n).padStart(2, '0');
  const a24h = SuniSchedule.format;
  const aTexto = a24h;

  function cargarHorario() {
    try {
      const guardado = JSON.parse(localStorage.getItem(HORARIO_CLAVE));
      if (Array.isArray(guardado) && guardado.length === 7) {
        return guardado.map(d => ({
          am: Number.isInteger(d?.am) && d.am >= 0 && d.am < 1440 ? d.am : HORARIO_DEFECTO.am,
          pm: Number.isInteger(d?.pm) && d.pm >= 0 && d.pm < 1440 ? d.pm : HORARIO_DEFECTO.pm
        }));
      }
    } catch (_) {}
    return DIAS.map(() => ({ ...HORARIO_DEFECTO }));
  }

  const horario = cargarHorario();

  function guardarHorario() {
    try { localStorage.setItem(HORARIO_CLAVE, JSON.stringify(horario)); return true; }
    catch (_) { anunciar('No se pudo guardar el horario en este navegador.'); return false; }
  }

  function pintarHora(el, min) {
    const [hours, minutes] = el.querySelectorAll('select');
    if (hours) hours.value = pad(Math.floor(min / 60));
    if (minutes) minutes.value = pad(min % 60);
  }

  function pintarHorario() {
    document.querySelectorAll('.row').forEach(fila => {
      const i = Number(fila.dataset.day) - 1;
      if (i < 0 || i > 6 || !horario[i]) return;
      const bloques = fila.querySelectorAll('.row__time');
      pintarHora(bloques[0], horario[i].am);
      pintarHora(bloques[1], horario[i].pm);
      fila.querySelectorAll('.row__icon i').forEach(el => el.remove());
    });
    /* La tarjeta "Tus alarmas" del home refleja el mismo horario */
    document.querySelectorAll('#grid .cell').forEach((cell, i) => {
      if (!horario[i]) return;
      const times = cell.querySelectorAll('.cell__time');
      if (times[0]) times[0].textContent = aTexto(horario[i].am);
      if (times[1]) times[1].textContent = aTexto(horario[i].pm);
    });
  }

  /* Separate numeric selectors guarantee 24h on every OS/locale. */
  function horaEditable(el, dia, tipo) {
    const label = `${tipo === 'am' ? 'Despertar' : 'Dormir'} del ${DIAS[dia]}`;
    el.replaceChildren();
    const inputs = [24, 60].map((count, index) => {
      const select = document.createElement('select');
      select.className = 'time-part';
      select.dataset.part = index === 0 ? 'hour' : 'minute';
      select.setAttribute('aria-label', `${label}: ${index === 0 ? 'hora (00–23)' : 'minutos (00–59)'}`);
      for (let i = 0; i < count; i++) select.add(new Option(pad(i), pad(i)));
      if (index) { const colon = document.createElement('b'); colon.textContent = ':'; el.append(colon); }
      el.append(select);
      return select;
    });
    inputs.forEach(select => select.addEventListener('change', () => {
      const value = SuniSchedule.parse(`${inputs[0].value}:${inputs[1].value}`);
      if (value === null) return;
      horario[dia][tipo] = value;
      const stored = guardarHorario();
      pintarHorario();
      document.getElementById('routine-status').textContent = stored ? 'Horario local; pulsa Guardar para sincronizar.' : 'Horario sin guardar; almacenamiento no disponible.';
      document.querySelector('[data-action="habitos:save"]').textContent = 'Guardar';
      document.dispatchEvent(new CustomEvent('schedule:change'));
    }));
    el.addEventListener('click', e => e.stopPropagation());
  }

  document.querySelectorAll('.row').forEach(fila => {
    const i = Number(fila.dataset.day) - 1;
    if (i < 0 || i > 6) return;

    const bloques = fila.querySelectorAll('.row__time');
    horaEditable(bloques[0], i, 'am');
    horaEditable(bloques[1], i, 'pm');

    /* Las nubes derivan en CSS; el clic abre cierra la fila (variante "Hora día") */
    fila.addEventListener('click', () => fila.classList.toggle('is-open'));
  });

  pintarHorario();

  /* Los 14 comandos que espera el firmware (una escritura por día y campo) */
  function comandosHorario() {
    return SuniSchedule.commands(horario);
  }

  /* ---------------------------------------------------------------
     6 · BUDDI — Conexión Bluetooth real con el ESP32 (ble.js)
     El botón se enciende SOLO cuando hay enlace de verdad; el clic
     conecta/desconecta (Web Bluetooth exige gesto de usuario).
     --------------------------------------------------------------- */
  const bluetooth = document.getElementById('bluetooth');
  const bleEstado = document.getElementById('ble-status');

  function anunciar(texto) {
    if (bleEstado) bleEstado.textContent = texto;
  }

  if (bluetooth && typeof SuniBLE !== 'undefined') {

    SuniBLE.onCambio(estado => {
      const on = estado === 'on';
      bluetooth.classList.toggle('is-on', on);
      bluetooth.classList.toggle('is-connecting', estado === 'conectando');
      bluetooth.setAttribute('aria-pressed', String(on));
      anunciar(SuniBLE.textoEstado());
    });

    SuniBLE.onRespuesta(texto => anunciar(`Buddi: ${texto}`));

    bluetooth.addEventListener('click', async () => {
      if (SuniBLE.estado() === 'on') { SuniBLE.desconectar(); return; }
      if (SuniBLE.estado() === 'conectando') return;

      anunciar('Conectando con Buddi…');
      try {
        await SuniBLE.conectar();
      }
      catch (err) {
        console.warn('Bluetooth:', err);
        anunciar(err && err.message ? err.message : 'No se pudo conectar con Buddi');
      }
    });
  }
  else if (bluetooth) {
    bluetooth.disabled = true;
    bluetooth.title = 'Requiere Chrome/Edge sobre http://127.0.0.1:8099 (o HTTPS)';
  }

  /* ---------------------------------------------------------------
     7 · BUDDI — Barra de sonido: DRAG → MOVE_IN 300ms EASE_OUT.
     Se generan las 50 barras (3×35, paso 6, de x=6 a x=300: Group 18
     mide 297px) y el arrastre fija el nivel; el estado inicial de Figma
     mantiene las 50 barras en su tono base (nivel completo).
     --------------------------------------------------------------- */
  const bar = document.getElementById('bar');
  let volumenApp = 100;                 /* nivel mostrado (0..100), compartido con BLE */
  let volumenConfirmado = null;
  function pintarEstadoVolumen() {
    const synced = SuniBLE.estado() === 'on' && volumenConfirmado === volumenApp;
    document.getElementById('volume-status').textContent = `${volumenApp} % · ${synced ? 'confirmado por Buddi' : 'pendiente de sincronizar'}`;
  }
  SuniBLE.onCambio(() => { if (SuniBLE.estado() !== 'on') volumenConfirmado = null; pintarEstadoVolumen(); });
  SuniBLE.onRespuesta(text => {
    const match = /^Volumen: (\d{1,3})$/.exec(text);
    if (match) { volumenConfirmado = Number(match[1]); pintarEstadoVolumen(); }
  });
  try { const value = Number(localStorage.getItem('suni.volumen') ?? 100); if (Number.isFinite(value) && value >= 0 && value <= 100) volumenApp = value; } catch (_) {}
  if (bar) {
    /* Group 18 (291:7522) = 297×35 en rel(6,3): 50 barras de 3px con paso 6
       (la 50ª acaba en x=303); la 51ª invadiría la zona del logo           */
    const LINES = 50;
    const frag = document.createDocumentFragment();
    const lines = [];
    for (let i = 0; i < LINES; i++) {
      const line = document.createElement('i');
      line.className = 'bar__line';
      line.style.left = `${6 + i * 6}px`;
      frag.appendChild(line);
      lines.push(line);
    }
    bar.appendChild(frag);

    let level = volumenApp / 100;
    const apply = () => {
      const lit = Math.round(level * LINES);
      lines.forEach((line, i) => line.classList.toggle('is-off', i >= lit));
      volumenApp = Math.round(level * 100);
      bar.setAttribute('aria-valuenow', String(volumenApp));
      pintarEstadoVolumen();
    };

    /* SETVOLUME=0..100 al soltar el arrastre o al pulsar una flecha */
    const enviarVolumen = () => {
      try { localStorage.setItem('suni.volumen', String(volumenApp)); } catch (_) { anunciar('No se pudo conservar el volumen.'); }
      if (typeof SuniBLE !== 'undefined') SuniBLE.enviar(`SETVOLUME=${volumenApp}`).then(ok => anunciar(ok ? 'Volumen confirmado por Buddi' : 'Volumen local; pendiente de sincronizar'));
    };
    apply();

    const setFromPointer = clientX => {
      const rect = bar.getBoundingClientRect();
      const x = (clientX - rect.left) * 336 / rect.width;
      level = Math.min(1, Math.max(0, (x - 6) / 297));
      apply();
    };

    let dragging = false;
    bar.addEventListener('pointerdown', e => {
      dragging = true;
      try { bar.setPointerCapture(e.pointerId); } catch (_) {}
      setFromPointer(e.clientX);
    });
    bar.addEventListener('pointermove', e => { if (dragging) setFromPointer(e.clientX); });
    bar.addEventListener('pointerup',   e => {
      dragging = false;
      try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
      enviarVolumen();
    });
    bar.addEventListener('pointercancel', () => { dragging = false; enviarVolumen(); });

    /* Accesibilidad: teclado */
    bar.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { level = Math.max(0, level - 0.05); apply(); e.preventDefault(); enviarVolumen(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { level = Math.min(1, level + 0.05); apply(); e.preventDefault(); enviarVolumen(); }
    });
  }

  /* ---------------------------------------------------------------
     8 · BUDDI — Botones de sonido: ON_HOVER / ON_PRESS (47:3059 /
     47:3063) más la elección real de la alarma: el clic envía
     SETSOUND=<slug> al ESP32 y deja el chip marcado (la elección
     persiste en localStorage y se reenvía al conectar).
     --------------------------------------------------------------- */
  const chipsSonido = Array.from(document.querySelectorAll('[data-sound]'));
  const SONIDO_CLAVE = 'suni.sonido';
  let sonidoActual = 'clasico';

  try { sonidoActual = localStorage.getItem(SONIDO_CLAVE) || 'clasico'; } catch (_) {}
  if (!chipsSonido.some(c => c.dataset.sound === sonidoActual)) sonidoActual = 'clasico';

  function marcarSonido(slug) {
    chipsSonido.forEach(chip => {
      const activo = chip.dataset.sound === slug;
      chip.classList.toggle('is-selected', activo);
      chip.setAttribute('aria-pressed', String(activo));
    });
  }

  chipsSonido.forEach(chip => {
    chip.addEventListener('click', () => {
      sonidoActual = chip.dataset.sound;
      marcarSonido(sonidoActual);
      anunciar('Sonido seleccionado. Pulsa Guardar para confirmar.');
    });
  });

  marcarSonido(sonidoActual);

  /* ---------------------------------------------------------------
     9 · PERFIL — "Editar" enfoca el primer campo (acción lógica: el
     nodo no define interacción en Figma).
     --------------------------------------------------------------- */
  const editBtn = document.querySelector('[data-action="perfil:editar"]');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const first = document.querySelector('.screen--perfil .p-input');
      if (first) first.focus();
    });
  }

  /* ---------------------------------------------------------------
     10 · SINCRONIZACIÓN CON EL DISPOSITIVO
     Al conectar: hora del navegador (SETTIME + SETDAY, hecha en
     ble.js), sonido, volumen y horario semanal completo. "Guardar"
     en Mis hábitos reenvía el horario al instante.
     --------------------------------------------------------------- */
  const guardarHabitos = document.querySelector('[data-action="habitos:save"]');
  function savedFeedback(button) {
    button.classList.add('is-saved');
    button.textContent = 'Cambios guardados';
    setTimeout(() => { button.classList.remove('is-saved'); button.textContent = 'Guardar'; }, 1500);
  }

  function sincronizarConfiguracion() {
    if (typeof SuniBLE === 'undefined') return Promise.resolve(false);

    return SuniBLE.enviarVarios([
      `SETSOUND=${sonidoActual}`,
      `SETVOLUME=${volumenApp}`
    ]).then(ok => ok && SuniBLE.enviarVarios(comandosHorario()));
  }

  if (typeof SuniBLE !== 'undefined') {
    SuniBLE.onConectar(async () => {
      const ok = await sincronizarConfiguracion();
      anunciar(ok ? 'Configuración confirmada por Buddi' : 'Configuración pendiente; no se confirmó el envío');
    });
  }

  document.querySelector('[data-action="buddi:save"]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { localStorage.setItem(SONIDO_CLAVE, sonidoActual); } catch (_) {}
    const ok = await sincronizarConfiguracion();
    button.disabled = false;
    if (ok) savedFeedback(button);
    anunciar(ok ? 'Configuración confirmada por Buddi' : 'Configuración local; pendiente de sincronizar');
  });

  if (guardarHabitos) {
    guardarHabitos.addEventListener('click', async () => {
      if (!guardarHorario()) return;
      document.dispatchEvent(new CustomEvent('schedule:save'));
      const snapshot = JSON.stringify(horario);
      guardarHabitos.disabled = true;
      const ok = await SuniBLE.enviarVarios(comandosHorario());
      guardarHabitos.disabled = false;
      const confirmed = ok && snapshot === JSON.stringify(horario);
      if (confirmed) savedFeedback(guardarHabitos);
      document.getElementById('routine-status').textContent = confirmed ? 'Sol: alarmas · Luna: descanso. Confirmado por Buddi.' : 'Horario local; pendiente de sincronizar con Buddi.';
    });
  }

  /* ---------------------------------------------------------------
     API de pruebas (consola / suite automatizada)
     --------------------------------------------------------------- */
  window.SuniApp = {
    horario: () => horario.map(d => ({ ...d })),
    comandosHorario,
    sonido: () => sonidoActual,
    volumen: () => volumenApp,
    estadoTarjeta: () => state,
    restaurarTarjeta: setSuniState,
    anunciar
  };

  /* ---------------------------------------------------------------
     Arranque. El splash ya no avanza solo: Figma define dos Botón
     explícitos (Inicia Sesión / Regístrate).
     --------------------------------------------------------------- */
  Fx.init('splash');
})();
