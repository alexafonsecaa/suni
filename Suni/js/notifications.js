(() => {
  'use strict';
  const screen = document.querySelector('.screen--habitos');
  const dialog = document.getElementById('notification-dialog');
  const accept = document.getElementById('notification-accept');
  const settings = document.getElementById('notification-settings');
  const FIRST_PROMPT_KEY = 'suni.notifications.firstSavePrompted.v1';
  let previousFocus;
  let registration;
  let config;
  let subscribed = false;
  let revision = 0;
  let syncQueue = Promise.resolve();
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  function token() {
    let value = localStorage.getItem('suni.pushToken');
    if (!value) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('suni.pushToken', value);
    }
    return value;
  }
  async function request(route, method, data) {
    const res = await fetch(`/api/push/${route}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Servidor de avisos no disponible (${res.status}).`);
    return res.json();
  }
  const status = text => settings.textContent = text;
  async function prepare() {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push no disponible. Usa HTTPS; en iPhone instala Suni en Inicio (iOS 16.4 o posterior).');
    registration = await navigator.serviceWorker.register('/sw.js');
    registration = await navigator.serviceWorker.ready;
    const response = await fetch('/api/push/config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Inicia el servidor Suni para programar avisos.');
    config = await response.json();
    if (!config.enabled || !config.publicKey) throw new Error('Servidor Push sin configurar.');
  }
  let ready = prepare();
  ready.catch(error => status(error.message));
  function open() {
    previousFocus = document.activeElement;
    screen.dataset.notificationState = 'prompt';
    screen.scrollTop = 0;
    dialog.hidden = false;
    [...screen.children].filter(el => el !== dialog).forEach(el => el.inert = true);
    accept.focus();
  }
  function close() {
    dialog.hidden = true;
    screen.dataset.notificationState = 'accepted';
    [...screen.children].forEach(el => el.inert = false);
    previousFocus?.focus();
  }
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); status('Notificaciones: sin activar. Pulsa para configurarlas.'); }
    if (e.key === 'Tab') { e.preventDefault(); accept.focus(); }
  });
  // Figma muestra la tarjeta de permiso al guardar; no repetirla en futuras visitas.
  // La preferencia se persiste antes de abrir para cubrir recargas y cierres.
  settings.hidden = true;
  document.addEventListener('schedule:save', () => {
    let alreadyPrompted = false;
    try { alreadyPrompted = localStorage.getItem(FIRST_PROMPT_KEY) === 'yes'; }
    catch (_) { alreadyPrompted = true; } // No insistir cuando el navegador bloquea almacenamiento.
    if (!alreadyPrompted) {
      try { localStorage.setItem(FIRST_PROMPT_KEY, 'yes'); } catch (_) {}
      if ('Notification' in window && Notification.permission === 'granted') { restore(); return; }
      open();
    } else if (subscribed) synchronize();
  });
  function synchronize() {
    const version = ++revision;
    status('Avisos: horario pendiente de sincronizar');
    if (!subscribed) return Promise.resolve();
    syncQueue = syncQueue.catch(() => {}).then(async () => {
      if (version !== revision) return;
      try {
        await request('schedule', 'PUT', { schedule: SuniApp.horario(), timeZone: timeZone() });
        if (version === revision) status('Avisos: programados 60 min antes · pulsa para revisar');
      } catch (error) { if (version === revision) status(`${error.message} Horario de avisos sin actualizar.`); }
    });
    return syncQueue;
  }
  document.addEventListener('schedule:change', synchronize);
  window.addEventListener('online', () => subscribed ? synchronize() : restore());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) restore(); });
  async function restore() {
    try {
      await ready;
      if (Notification.permission !== 'granted') {
        if (subscribed) await request('subscription', 'DELETE');
        subscribed = false; status('Notificaciones: sin permiso · pulsa para configurar'); return;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { subscribed = false; status('Notificaciones: suscripción pendiente · pulsa para activar'); return; }
      const version = ++revision;
      await request('subscription', 'PUT', { subscription: subscription.toJSON(), schedule: SuniApp.horario(), timeZone: timeZone() });
      subscribed = true;
      if (version === revision) status('Avisos: programados 60 min antes · pulsa para revisar');
      else synchronize();
    } catch (error) { status(error.message); }
  }
  accept.addEventListener('click', async () => {
    if (!config || !registration) { close(); status('Notificaciones no disponibles en esta vista local; se requiere servidor Push y HTTPS.'); return; }
    // Must run directly from a user gesture, notably on iOS home-screen apps.
    const permission = Notification.requestPermission();
    accept.disabled = true;
    try {
      if (await permission !== 'granted') throw new Error('Permiso no concedido. Puedes cambiarlo en los ajustes del navegador.');
      const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
      const applicationServerKey = Uint8Array.from(raw, c => c.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await request('subscription', 'PUT', { subscription: subscription.toJSON(), schedule: SuniApp.horario(), timeZone: timeZone() });
      subscribed = true;
      await synchronize();
    } catch (error) { status(error.message); }
    finally { accept.disabled = false; close(); }
  });
  restore();
})();
