/**
 * components/topbar.js — Topbar de StockAI
 *
 * Expone:
 *  Topbar.mount()         — inyecta el HTML en el elemento .topbar
 *  Topbar.setTitle(title, sub?) — actualiza título y subtítulo
 *  Topbar.setSecure(ok)   — muestra chip verde (ok) o rojo (falló)
 */

const Topbar = {
  mount() {
    const el = document.querySelector('.topbar');
    if (!el) return;

    el.innerHTML = `
      <!-- Título dinámico de la página actual -->
      <div>
        <div class="topbar-title" id="topbar-title">Dashboard</div>
        <div class="topbar-sub"  id="topbar-sub"></div>
      </div>

      <div class="topbar-spacer"></div>

      <!-- Chip de estado de sesión -->
      <div class="secure-chip" id="secure-chip" title="Sesión cifrada TLS 1.3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span id="secure-chip-text">Sesión segura</span>
      </div>

      <!-- Botón alertas con badge -->
      <button
        class="btn btn-ghost btn-icon"
        id="btn-alertas-topbar"
        onclick="window.navigate('/alertas')"
        title="Alertas activas"
        style="position:relative"
        aria-label="Ver alertas"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="notif-dot" id="topbar-notif-dot" style="display:none"></span>
      </button>

      <!-- Botón ingreso rápido -->
      <button class="btn btn-primary" onclick="window.navigate('/ingreso')" aria-label="Ingreso rápido">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ingreso rápido
      </button>

      <!-- Hamburger mobile -->
      <button class="btn btn-ghost btn-icon" id="btn-menu" style="display:none" aria-label="Menú">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
    `;

    this._bindMobile();
  },

  /**
   * Actualizar título y subtítulo del topbar.
   * @param {string} title
   * @param {string} [sub] — texto gris debajo del título
   */
  setTitle(title, sub = '') {
    const t = document.getElementById('topbar-title');
    const s = document.getElementById('topbar-sub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub;
  },

  /**
   * Mostrar/ocultar el punto rojo de notificación en el botón de alertas.
   * @param {boolean} hasAlerts
   */
  setAlertDot(hasAlerts) {
    const dot = document.getElementById('topbar-notif-dot');
    if (dot) dot.style.display = hasAlerts ? 'block' : 'none';
  },

  /**
   * Actualizar el chip de estado de sesión.
   * @param {boolean} ok — true: verde "Sesión segura", false: rojo "Sin conexión"
   */
  setSecure(ok) {
    const chip = document.getElementById('secure-chip');
    const text = document.getElementById('secure-chip-text');
    if (!chip) return;
    chip.style.background = ok ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)';
    chip.style.borderColor = ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
    chip.style.color = ok ? 'var(--accent-green)' : 'var(--accent-red)';
    if (text) text.textContent = ok ? 'Sesión segura' : 'Sin conexión';
  },

  _bindMobile() {
    // Mostrar el hamburger en mobile
    const mq  = window.matchMedia('(max-width: 768px)');
    const btn = document.getElementById('btn-menu');
    const toggle = () => { if (btn) btn.style.display = mq.matches ? 'flex' : 'none'; };
    mq.addEventListener('change', toggle);
    toggle();

    // Cerrar sidebar al navegar en mobile
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        if (mq.matches) document.getElementById('sidebar')?.classList.remove('open');
      });
    });
  },
};

export default Topbar;
