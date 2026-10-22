/* =========================================================================
   Suni · interactions.js
   Motor de transiciones que replica los tipos, duraciones y easings de los
   prototipos del archivo Figma "Suni" (2026-10-21):

     · DISSOLVE     300ms  EASE_IN          (botón Ingresar)
     · SLIDE_IN     400ms  EASE_OUT / EASE_IN  dir LEFT
                    (splash, botones de Home, Registrarse)
     · SLIDE_OUT    400ms  EASE_IN          dir LEFT (splash/login/registro)
                                             dir RIGHT (hábitos/buddi/perfil)
     · SMART_ANIMATE 300ms EASE_OUT         (variantes de la tarjeta)
     · MOVE_IN      300ms  EASE_OUT         (barra de sonido)

   Easings exactos de Figma:
     EASE_IN  = cubic-bezier(.42, 0, 1,  1)
     EASE_OUT = cubic-bezier( 0, 0, .58, 1)

   La tabla NAV completa los destinos que llegaban como `destinationId: null`
   con la navegación lógica para que todas las pantallas sean alcanzables
   (cada entrada indica si el destino era nulo en Figma).
   ========================================================================= */

const Fx = (() => {

  const EASE_IN  = 'cubic-bezier(.42,0,1,1)';
  const EASE_OUT = 'cubic-bezier(0,0,.58,1)';

  const TRANSITIONS = {
    /* Botones del splash · Botón Suni Buddi · Botón usuario  (ON_CLICK/MOUSE_UP) */
    SLIDE_IN_OUT:  { type: 'slide-in',  duration: 400, easing: EASE_OUT, dir: 'LEFT' },
    /* Botón Rutina · Botón "Registrarse"                     (MOUSE_UP/ON_CLICK) */
    SLIDE_IN_IN:   { type: 'slide-in',  duration: 400, easing: EASE_IN,  dir: 'LEFT' },
    /* Flecha de regreso de splash · login · registro          (MOUSE_UP)          */
    SLIDE_OUT_L:   { type: 'slide-out', duration: 400, easing: EASE_IN,  dir: 'LEFT' },
    /* Flecha de regreso de hábitos · buddi · perfil           (MOUSE_UP)          */
    SLIDE_OUT_R:   { type: 'slide-out', duration: 400, easing: EASE_IN,  dir: 'RIGHT' },
    /* Botón "Ingresar"                                        (MOUSE_UP)          */
    DISSOLVE:      { type: 'dissolve',  duration: 300, easing: EASE_IN },
    /* Cambios de variante de la tarjeta                       (SMART_ANIMATE)     */
    SMART:         { type: 'smart',     duration: 300, easing: EASE_OUT },
    /* Arrastre de la barra de sonido                          (MOVE_IN)           */
    MOVE_IN:       { type: 'move-in',   duration: 300, easing: EASE_OUT }
  };

  /* ---------------------------------------------------------------------
     Mapa de navegación. Los destinos de Figma llegaban como
     `destinationId: null`: aquí se les asignó el destino lógico.
     --------------------------------------------------------------------- */
  const NAV = {
    /* --- Splash (331:7579) ---------------------------------------------- */
    'splash:sesion':   ['login',    TRANSITIONS.SLIDE_IN_OUT],  /* completado */
    'splash:registro': ['registro', TRANSITIONS.SLIDE_IN_OUT],  /* completado */
    'splash:back':     ['login',    TRANSITIONS.SLIDE_OUT_L],   /* completado */

    /* --- Login (377:429) ------------------------------------------------- */
    'login:home':      ['home',     TRANSITIONS.DISSOLVE],      /* completado */
    'login:back':      ['splash',   TRANSITIONS.SLIDE_OUT_L],

    /* --- Crear cuenta (95:3388) ------------------------------------------ */
    'registro:login':  ['login',    TRANSITIONS.SLIDE_IN_IN],   /* completado */
    'registro:back':   ['splash',   TRANSITIONS.SLIDE_OUT_L],

    /* --- Home (95:3394) -------------------------------------------------- */
    'home:buddi':      ['buddi',    TRANSITIONS.SLIDE_IN_OUT],  /* completado */
    'home:habitos':    ['habitos',  TRANSITIONS.SLIDE_IN_IN],   /* completado */
    'home:perfil':     ['perfil',   TRANSITIONS.SLIDE_IN_OUT],  /* completado */

    /* --- Regreso desde las pantallas internas ---------------------------- */
    'back:home':       ['home',     TRANSITIONS.SLIDE_OUT_R],   /* completado */
    'habitos:home':    ['home',     TRANSITIONS.DISSOLVE],      /* completado */
    'buddi:home':      ['home',     TRANSITIONS.DISSOLVE],      /* completado */
    'perfil:home':     ['home',     TRANSITIONS.DISSOLVE]       /* completado */
  };

  let current = null;
  let busy = false;

  const screens = () => Array.from(document.querySelectorAll('.screen'));

  function screenEl(name) {
    return document.querySelector(`.screen[data-screen="${name}"]`);
  }

  function reset(el) {
    el.classList.remove('is-current', 'is-above');
    el.style.transform = '';
    el.style.transition = '';
    el.style.opacity = '';
    el.style.zIndex = '';
  }

  function finish(from, to) {
    reset(from);
    to.classList.remove('is-above');
    to.classList.add('is-current');
    to.style.transform = '';
    to.style.transition = '';
    to.style.opacity = '';
    to.style.zIndex = '';

    /* El registro se abre siempre arriba del todo de su desplazamiento */
    const scroll = to.querySelector('.scroll');
    if (scroll) scroll.scrollTop = 0;

    current = to.dataset.screen;
    busy = false;
    document.dispatchEvent(new CustomEvent('screen:change', { detail: { name: current } }));
  }

  /* Ancla de respaldo: si no llega transitionend (p. ej. con movimiento
     reducido) la navegación se completa igual. */
  function settle(el, type, duration, done) {
    let settled = false;
    const guard = () => { if (settled) return; settled = true; done(); };
    el.addEventListener('transitionend', guard, { once: true });
    const timer = setTimeout(guard, duration + 90);
    return () => { clearTimeout(timer); };
  }

  function goTo(name, transition) {
    const to = screenEl(name);
    if (!to || busy) return;

    const from = current ? screenEl(current) : null;
    if (from === to) return;

    busy = true;
    const t = transition || TRANSITIONS.DISSOLVE;

    if (!from) {
      to.classList.add('is-current');
      current = name;
      busy = false;
      return;
    }

    void to.offsetWidth;

    if (t.type === 'dissolve') {
      /* DISSOLVE: fundido cruzado (la nueva encima, EASE_IN) */
      to.classList.add('is-above');
      to.style.transition = 'none';
      to.style.opacity = '0';
      void to.offsetWidth;
      to.style.transition = `opacity ${t.duration}ms ${t.easing}`;
      to.style.opacity = '1';
      settle(to, t.type, t.duration, () => finish(from, to));

    } else if (t.type === 'slide-in') {
      /* SLIDE_IN: la pantalla nueva entra deslizándose; dir=LEFT →
         entra desde la derecha moviéndose hacia la izquierda            */
      const offset = t.dir === 'LEFT' ? 100 : -100;
      to.classList.add('is-above');
      to.style.transition = 'none';
      to.style.transform = `translateX(${offset}%)`;
      void to.offsetWidth;
      to.style.transition = `transform ${t.duration}ms ${t.easing}`;
      to.style.transform = 'translateX(0)';
      settle(to, t.type, t.duration, () => finish(from, to));

    } else if (t.type === 'slide-out') {
      /* SLIDE_OUT: la pantalla actual sale; la destino queda visible
         debajo (is-current) mientras la actual se desliza por encima     */
      to.classList.add('is-current');
      from.classList.add('is-above');
      const offset = t.dir === 'LEFT' ? -100 : 100;
      from.style.transition = 'none';
      from.style.transform = 'translateX(0)';
      void from.offsetWidth;
      from.style.transition = `transform ${t.duration}ms ${t.easing}`;
      from.style.transform = `translateX(${offset}%)`;
      settle(from, t.type, t.duration, () => finish(from, to));

    } else {
      finish(from, to);
    }
  }

  function init(first) {
    screens().forEach(reset);
    const el = screenEl(first);
    el.classList.add('is-current');
    current = first;
    busy = false;
  }

  return {
    NAV,
    TRANSITIONS,
    goTo,
    init,
    get current() { return current; },
    get busy() { return busy; }
  };
})();
