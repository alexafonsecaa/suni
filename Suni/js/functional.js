/* Local profile: this is device-local storage, not account authentication. */
(() => {
  'use strict';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { SuniApp.anunciar('No se pudo guardar en este navegador.'); return false; } };
  let profile = read('suni.profile', null);
  const device = document.getElementById('device');
  const resize = () => {
    const scale = device.clientWidth / 420;
    device.style.setProperty('--screen-scale', scale);
    document.querySelectorAll('.screen').forEach(el => el.style.height = `${device.clientHeight / scale}px`);
  };
  new ResizeObserver(resize).observe(device);
  resize();

  function inputFor(el, type, label) {
    const input = document.createElement('input');
    input.className = el.className;
    input.style.cssText = el.style.cssText;
    input.type = type;
    input.setAttribute('aria-label', label);
    input.maxLength = 120;
    el.replaceWith(input);
    return input;
  }
  const fields = {};
  ['login', 'registro'].forEach(screen => {
    fields[screen] = [...document.querySelectorAll(`.screen--${screen} .field`)].map(field => {
      const label = field.querySelector('.field__label').textContent;
      return inputFor(field.querySelector('.field__box'), /contraseña/i.test(label) ? 'password' : label === 'Correo' ? 'email' : 'text', label);
    });
    const note = document.createElement('p');
    note.className = 'local-note';
    note.textContent = 'Perfil local en este navegador. Sin cuenta en línea ni contraseña.';
    (document.querySelector(`.screen--${screen} .sheet`) || document.querySelector(`.screen--${screen}`)).append(note);
    fields[screen].filter(i => i.type === 'password').forEach(i => i.closest('.field').hidden = true);
  });
  const profileInputs = [...document.querySelectorAll('.p-input')].map((el, i) => inputFor(el, i === 1 ? 'email' : 'text', ['Nombre completo', 'Correo electrónico', 'Usuario', 'Contraseña'][i]));
  profileInputs[3].hidden = true;
  [...document.querySelectorAll('.perfil__label')].at(-1).hidden = true;
  const profileScreen = document.querySelector('.screen--perfil');
  function editProfile(editing) {
    profileScreen.classList.toggle('is-editing', editing);
    profileInputs.forEach(input => input.readOnly = !editing);
    profileScreen.dataset.figmaNode = editing ? '699:10950' : '406:7770';
  }
  editProfile(false);
  document.querySelector('[data-action="perfil:editar"]').addEventListener('click', () => { editProfile(true); profileInputs[0].focus(); });
  function renderProfile() {
    const p = profile || { name: '', surname: '', email: '', username: '' };
    const name = document.createElement('b'); name.textContent = p.name;
    document.querySelector('.home__greeting').replaceChildren(document.createTextNode(`¡Buenos días${p.name ? ', ' : ''}`), name, document.createTextNode('!'));
    document.querySelector('.perfil__name').textContent = p.name || 'Tu perfil';
    profileInputs[0].value = [p.name, p.surname].filter(Boolean).join(' ');
    profileInputs[1].value = p.email;
    profileInputs[2].value = p.username;
  }
  renderProfile();
  // Capture before the original navigation handlers: only navigate after validation.
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!['registro:login', 'login:home', 'perfil:home'].includes(action)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (action === 'registro:login') {
      const [name, surname, username, email] = fields.registro.map(i => i.value.trim());
      if (!name || !username || !fields.registro[3].checkValidity()) { SuniApp.anunciar('Introduce nombre, usuario y un correo válido si deseas incluirlo.'); return; }
      const next = { name, surname, username, email };
      if (!save('suni.profile', next)) return;
      // Un perfil nuevo comienza sin propósitos; evita mostrar los de otro usuario.
      localStorage.removeItem('suni.dailyGoals');
      if (typeof resetGoalsForNewProfile === 'function') resetGoalsForNewProfile();
      profile = next; renderProfile(); Fx.goTo('home');
    } else if (action === 'login:home') {
      if (!profile) { SuniApp.anunciar('Primero crea tu perfil local con Regístrate.'); return; }
      const value = fields.login[0].value.trim();
      if (!value || (value !== profile.username && value !== profile.email)) { SuniApp.anunciar('Escribe el usuario o correo de tu perfil local. Esto no es autenticación.'); return; }
      Fx.goTo('home');
    } else {
      if (!profileInputs[0].value.trim() || !profileInputs[1].checkValidity()) { SuniApp.anunciar('Revisa el nombre y el correo.'); return; }
      const next = { name: profileInputs[0].value.trim(), surname: '', email: profileInputs[1].value.trim(), username: profileInputs[2].value.trim() };
      if (!save('suni.profile', next)) return;
      profile = next; renderProfile(); editProfile(false); SuniApp.anunciar('Perfil guardado en este navegador.');
    }
  }, true);

  // Propósitos independientes por día; cada texto se conserva en la tarjeta
  // azul de la variante guardada. Nunca se envían a servicios externos.
  const suniCard = document.getElementById('suni');
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const history = read('suni.dailyGoals', {});
  function resetGoalsForNewProfile() {
    for (const key of Object.keys(history)) delete history[key];
    // Se ejecuta después de registrar un perfil nuevo.
    if (typeof loadDay === 'function') loadDay();
  }
  const goals = [...document.querySelectorAll('[data-goal-input]')].map((el, i) => {
    const input = inputFor(el, 'text', `Propósito ${i + 1}`);
    input.dataset.goalInput = '';
    input.maxLength = 65;
    input.placeholder = ''; // Sin texto predeterminado: el usuario escribe su propio propósito.
    return input;
  });
  const summaries = goals.map((input, i) => {
    const label = document.createElement('span');
    label.className = 'goal-summary';
    label.style.top = `${198 + i*40}px`;
    label.setAttribute('aria-label', `Propósito guardado ${i+1}`);
    suniCard.append(label);
    return label;
  });
  const syncSummaries = () => summaries.forEach((el,i) => { el.textContent = goals[i].value.trim(); el.title = el.textContent; });
  const loadDay = () => {
    const entry = history[dayKey()];
    goals.forEach((el,i) => { el.value = entry?.goals?.[i] || ''; });
    syncSummaries();
    if (entry?.mood && ['feliz','normal','triste'].includes(entry.mood)) SuniApp.restaurarTarjeta(`done-${entry.mood}`);
    else SuniApp.restaurarTarjeta('default');
  };
  document.querySelector('[data-goal-save]').addEventListener('click', event => {
    const values = goals.map(el => el.value.trim());
    if (values.some(v => !v)) {
      event.stopImmediatePropagation();
      SuniApp.anunciar('Escribe tus tres propósitos antes de guardar.');
      goals.find(el => !el.value.trim())?.focus();
      return;
    }
    const raw = SuniApp.estadoTarjeta().replace(/^(saved-|done-)/, '');
    const mood = ['feliz','normal','triste'].includes(raw) ? raw : 'normal';
    history[dayKey()] = { goals: values, mood, savedAt: new Date().toISOString() };
    if (!save('suni.dailyGoals', history)) { event.stopImmediatePropagation(); return; }
    syncSummaries();
    SuniApp.anunciar('Tus tres propósitos de hoy quedaron guardados.');
  }, true);
  document.querySelector('[data-goal-edit]').addEventListener('click', () => {
    requestAnimationFrame(() => goals[0].focus());
  });
  loadDay();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDay(); });
  const date = () => document.querySelector('.card__date').textContent = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  date(); document.addEventListener('visibilitychange', date);
  const status = document.getElementById('ble-status');
  status.textContent = '';
  let timeout;
  new MutationObserver(() => { clearTimeout(timeout); if (status.textContent) timeout = setTimeout(() => { status.textContent = ''; }, 7000); }).observe(status, { childList: true });
})();
