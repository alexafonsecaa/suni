/* =========================================================================
   Suni · ble.js
   Puente Bluetooth Low Energy entre la aplicación y el firmware
   1ESP32_Suni_v2 (dispositivo "ESP32_alarma_ble").

   Comandos que entiende el firmware (escribe uno por llamada, <= 20 bytes):

     SETTIME=HH:MM:SS   hora actual tomada del navegador
     SETDAY=1..7        día ISO 8601 (1 = lunes … 7 = domingo)
     SETALARM=d,HH:MM   alarma del día d  (hora "am" de Mis hábitos)
     SETSLEEP=d,HH:MM   hora de dormir del día d (hora "pm")
     SETSOUND=…         clasico | pajaro | rio | digital
     SETVOLUME=0..100   volumen de la barra
     STATUS · STOP · TEST

   · conectar() exige gesto de usuario (el clic del botón Bluetooth) y
     Chrome/Edge sobre un contexto seguro: http://127.0.0.1:8099 o https.
   · Al conectar se envía la hora del navegador y se avisa a la app
     (onConectar) para que empuje sonido, volumen y horario semanal.
   · La hora se reenvía sola cada 30 segundos.
   · ?mock=1 en la URL (o SuniBLE.activarMock()) simula el dispositivo
     para probar toda la interfaz sin tener el ESP32 conectado.
   ========================================================================= */

(() => {
  'use strict';

  const UUID_SERVICIO = '12345678-1234-1234-1234-1234567890ab';
  const UUID_CARACTERISTICA = 'abcd1234-ab12-cd34-ef56-abcdef123456';

  const INTERVALO_HORA = 30000;   /* reenvío de la hora cada 30 s */
  const PAUSA_ESCRITURA = 60;     /* ms entre comandos (MTU 20 bytes) */

  let estadoInterno = 'off';      /* off | conectando | on */
  let dispositivo = null;
  let caracteristica = null;
  let temporizadorHora = 0;
  let mock = false;
  let cola = Promise.resolve();
  let pendiente = null;
  let generacion = 0;

  function confirmacion(cmd, texto) {
    if (cmd.startsWith('SETTIME=')) return texto === 'Hora configurada';
    const days = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    if (cmd.startsWith('SETDAY=')) return texto === `Dia: ${days[Number(cmd.split('=')[1])]}`;
    const schedule = /^(SETALARM|SETSLEEP)=([1-7]),(\d{2}:\d{2})$/.exec(cmd);
    if (schedule) return texto === `${schedule[1] === 'SETALARM' ? 'Alarma' : 'Sueno'} ${days[+schedule[2]]} ${schedule[3]}`;
    if (cmd.startsWith('SETSOUND=')) return texto === `Sonido: ${cmd.split('=')[1]}`;
    if (cmd.startsWith('SETVOLUME=')) return texto === `Volumen: ${cmd.split('=')[1]}`;
    if (cmd === 'STOP') return texto === 'Alarma detenida';
    if (cmd === 'TEST') return texto === 'Test alarma';
    return cmd === 'STATUS' && /^\d{2}:\d{2}:\d{2} /.test(texto);
  }

  const oyentes = [];             /* onCambio */
  const despertares = [];         /* onConectar */
  const respuestas = [];          /* onRespuesta */

  /* Registro de todo lo que entra y sale (útil para depurar y probar) */
  const historial = [];

  /* ---------------------------------------------------------------
     Estado
     --------------------------------------------------------------- */
  const estado = () => estadoInterno;

  const textoEstado = () => {
    if (estadoInterno === 'on') return 'Buddi conectado';
    if (estadoInterno === 'conectando') return 'Conectando con Buddi…';
    return 'Buddi desconectado';
  };

  function registrar(direccion, texto) {
    historial.push({ direccion, texto, t: Date.now() });
    if (historial.length > 300) historial.shift();
    const prefijo = direccion === '→' ? 'Suni→Buddi' : direccion === '←' ? 'Buddi→Suni' : 'BLE';
    console.info(`${prefijo}: ${texto}`);
  }

  function fijarEstado(siguiente) {
    if (estadoInterno === siguiente) return;
    estadoInterno = siguiente;
    oyentes.forEach(fn => { try { fn(siguiente); } catch (e) { console.error(e); } });
  }

  /* ---------------------------------------------------------------
     Comandos de hora (los pone el navegador, el ESP32 solo cuenta)
     --------------------------------------------------------------- */
  function comandosHora() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const iso = d.getDay() === 0 ? 7 : d.getDay();   /* ISO 8601 */

    return [
      `SETTIME=${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
      `SETDAY=${iso}`
    ];
  }

  /* ---------------------------------------------------------------
     Enviar comandos
     --------------------------------------------------------------- */
  function enviar(cmd) {
    const version = generacion;
    const tarea = cola.then(() => version === generacion ? escribir(cmd) : false);
    cola = tarea.catch(() => false);
    return tarea;
  }

  async function escribir(cmd) {

    if (estadoInterno !== 'on') return false;

    if (mock) {
      registrar('→', cmd);
      /* Simula la respuesta que daría el firmware */
      setTimeout(() => recibir(`OK ${cmd.split('=')[0]}`), 30);
      return true;
    }

    if (!caracteristica) return false;

    let timer;
    try {
      const bytes = new TextEncoder().encode(cmd);
      if (bytes.length > 20) throw new Error('Comando demasiado largo');
      const respuesta = new Promise(resolve => {
        pendiente = { cmd, resolve };
        timer = setTimeout(() => resolve(false), 3000);
      });
      const written = await Promise.race([
        caracteristica.writeValueWithResponse(bytes).then(() => true),
        respuesta.then(ok => ok ? true : false)
      ]);
      if (!written) { desconectar(); return false; }
      registrar('→', cmd);
      const ok = await respuesta;
      if (!ok) {
        respuestas.forEach(fn => fn('Cambio no confirmado; vuelve a conectar para sincronizar.'));
        desconectar();
      }
      return ok;
    }
    catch (err) {
      console.warn('BLE: no se pudo enviar', cmd, err);
      desconectar();
      return false;
    }
    finally { clearTimeout(timer); pendiente = null; }
  }

  /* Uno detrás de otro: el MTU por defecto admite 20 bytes por escritura */
  async function enviarVarios(cmds, pausa = PAUSA_ESCRITURA) {
    for (const cmd of cmds) {
      const ok = await enviar(cmd);
      if (!ok) return false;
      await new Promise(r => setTimeout(r, pausa));
    }
    return true;
  }

  const enviarHora = () => enviarVarios(comandosHora());

  /* ---------------------------------------------------------------
     Notificaciones del dispositivo
     --------------------------------------------------------------- */
  function recibir(texto) {
    if (!texto) return;
    registrar('←', texto);
    if (pendiente && confirmacion(pendiente.cmd, texto)) pendiente.resolve(true);
    else if (pendiente && /invalido|invalida|no valido|fuera de rango/i.test(texto)) pendiente.resolve(false);
    respuestas.forEach(fn => { try { fn(texto); } catch (_) {} });
  }

  function alNotificar(evento) {
    const bytes = evento.target.value;
    const texto = new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
    recibir(texto);
  }

  /* ---------------------------------------------------------------
     Conexión
     --------------------------------------------------------------- */
  async function despertar() {

    /* El firmware ya sabe qué hora es y qué día toca */
    if (!await enviarHora()) throw new Error('Buddi conectado, pero no confirmó la hora.');

    temporizadorHora = setInterval(enviarHora, INTERVALO_HORA);

    /* La app aprovecha para mandar sonido, volumen y horario */
    despertares.forEach(fn => {
      try {
        const r = fn();
        if (r && typeof r.catch === 'function') r.catch(e => console.warn('BLE sync:', e));
      }
      catch (e) { console.error(e); }
    });
  }

  async function conectar() {

    if (estadoInterno === 'on' || estadoInterno === 'conectando') return;

    fijarEstado('conectando');

    if (mock) {
      await new Promise(r => setTimeout(r, 400));
      fijarEstado('on');
      recibir('READY');
      await despertar();
      return;
    }

    if (!window.isSecureContext || !('bluetooth' in navigator)) {
      fijarEstado('off');
      throw new Error('BLE requiere HTTPS y un navegador compatible, como Chrome en Android. Safari en iPhone no admite Web Bluetooth.');
    }

    try {
      dispositivo = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'ESP32_alarma_ble' }],
        optionalServices: [UUID_SERVICIO]
      });

      dispositivo.addEventListener('gattserverdisconnected', alDesconectarGATT);

      const servidor = await dispositivo.gatt.connect();
      const servicio = await servidor.getPrimaryService(UUID_SERVICIO);
      caracteristica = await servicio.getCharacteristic(UUID_CARACTERISTICA);

      caracteristica.addEventListener('characteristicvaluechanged', alNotificar);
      await caracteristica.startNotifications();

      fijarEstado('on');
      await despertar();
    }
    catch (err) {
      if (dispositivo?.gatt?.connected) dispositivo.gatt.disconnect();
      limpiarEnlace();
      fijarEstado('off');
      throw err;
    }
  }

  function limpiarEnlace() {
    generacion++;
    if (pendiente) pendiente.resolve(false);
    caracteristica?.removeEventListener('characteristicvaluechanged', alNotificar);
    dispositivo?.removeEventListener('gattserverdisconnected', alDesconectarGATT);
    clearInterval(temporizadorHora);
    temporizadorHora = 0;
    caracteristica = null;
    dispositivo = null;
  }

  function alDesconectarGATT() {
    limpiarEnlace();
    fijarEstado('off');
  }

  function desconectar() {
    if (mock) {
      limpiarEnlace();
      registrar('·', 'desconectado (simulado)');
      fijarEstado('off');
      return;
    }
    if (dispositivo && dispositivo.gatt && dispositivo.gatt.connected) {
      dispositivo.gatt.disconnect();   /* alDesconectarGATT se encarga */
    }
    else {
      limpiarEnlace();
      fijarEstado('off');
    }
  }

  /* ---------------------------------------------------------------
     Modo simulado (sin hardware) para pruebas y demostraciones
     --------------------------------------------------------------- */
  function activarMock() {
    throw new Error('La conexión simulada está deshabilitada. Conecta un ESP32 real.');
  }


  /* ---------------------------------------------------------------
     API pública
     --------------------------------------------------------------- */
  window.SuniBLE = {
    UUID_SERVICIO,
    UUID_CARACTERISTICA,
    estado,
    textoEstado,
    conectar,
    desconectar,
    enviar,
    enviarVarios,
    enviarHora,
    historial,
    activarMock,
    onCambio: fn => oyentes.push(fn),
    onConectar: fn => despertares.push(fn),
    onRespuesta: fn => respuestas.push(fn),
    get esMock() { return mock; }
  };
})();
