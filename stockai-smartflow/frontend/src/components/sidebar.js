/**
 * components/sidebar.js — Sidebar de navegación StockAI
 *
 * Expone:
 *  Sidebar.mount()          — inyecta el HTML en #sidebar (llamar desde main.js)
 *  Sidebar.setUser(user)    — rellena avatar, nombre y rol
 *  Sidebar.setBadge(id, n)  — actualiza un badge de navegación
 *  Sidebar.setActive(route) — marca el item activo
 */

// SVG icons inline (sin dependencia de icon library)
const ICONS = {
  dashboard:    `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  inventario:   `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  ingreso:      `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  fefo:         `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`,
  alertas:      `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  stock:        `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
  consulta:     `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  sugerencias:  `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  seguridad:    `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};

// Definición de la navegación
const NAV_SECTIONS = [
  {
    label: 'General',
    items: [
      { route: '/dashboard',    label: 'Dashboard',       icon: 'dashboard' },
      { route: '/alertas',      label: 'Alertas',         icon: 'alertas',   badgeId: 'badge-alertas' },
    ],
  },
  {
    label: 'Almacenaje',
    items: [
      { route: '/ingreso',      label: 'Ingreso IA',      icon: 'ingreso' },
      { route: '/inventario',   label: 'Inventario',      icon: 'inventario' },
      { route: '/fefo',         label: 'FEFO / Lotes',    icon: 'fefo',      badgeId: 'badge-fefo' },
      { route: '/stock-critico',label: 'Stock Crítico',   icon: 'stock',     badgeId: 'badge-critico' },
    ],
  },
  {
    label: 'Reposición',
    items: [
      { route: '/consulta',     label: 'Consulta Visual', icon: 'consulta' },
      { route: '/sugerencias',  label: 'Sugerencias IA',  icon: 'sugerencias', badgeTxt: 'IA', badgeColor: 'var(--accent-purple)' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { route: '/seguridad',    label: 'Seguridad',       icon: 'seguridad' },
    ],
  },
];

// ── Render del HTML completo del sidebar ──────────────────────────────────────
function _buildHTML() {
  const sections = NAV_SECTIONS.map(({ label, items }) => `
    <div class="sidebar-section">
      <span class="sidebar-label">${label}</span>
      ${items.map(({ route, label: lbl, icon, badgeId, badgeTxt, badgeColor }) => `
        <button
          class="nav-item"
          data-route="${route}"
          onclick="window.navigate('${route}')"
          aria-label="${lbl}"
        >
          ${ICONS[icon] ?? ''}
          ${lbl}
          ${badgeId ? `<span class="nav-badge" id="${badgeId}">0</span>` : ''}
          ${badgeTxt ? `<span class="nav-badge" style="background:${badgeColor ?? 'var(--accent-red)'}">${badgeTxt}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `).join('');

  return `
    <div class="sidebar-logo">
      <div class="logo-icon">S</div>
      <span class="logo-text">Stock<span>AI</span></span>
    </div>
    <div class="sidebar-scroll">${sections}</div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-bottom">
      <div style="position:relative">
        <div class="user-card" id="user-card-btn" role="button" tabindex="0" aria-haspopup="true">
          <div class="user-avatar" id="user-avatar">?</div>
          <div class="user-info">
            <div class="user-name" id="user-name">Cargando…</div>
            <div class="user-role" id="user-role">—</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
        <div class="profile-dropdown" id="profile-dropdown" role="menu">
          <div class="profile-header">
            <div class="profile-avatar-lg" id="profile-avatar-lg">?</div>
            <div>
              <div class="profile-dd-name" id="profile-dd-name">—</div>
              <div class="profile-dd-email" id="profile-dd-email">—</div>
            </div>
          </div>
          <button class="profile-menu-item" data-dropdown-nav="/perfil" role="menuitem">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Ver perfil
          </button>
          <button class="profile-menu-item" data-dropdown-nav="/configuracion" role="menuitem">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Configuración
          </button>
          <button class="profile-menu-item" data-dropdown-nav="/seguridad" role="menuitem">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Seguridad
          </button>
          <div class="profile-divider"></div>
          <button class="profile-menu-item danger" id="btn-logout" role="menuitem">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── API pública ───────────────────────────────────────────────────────────────
const Sidebar = {
  /** Inyectar el sidebar en el elemento #sidebar del DOM */
  mount() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    el.innerHTML = _buildHTML();
    this._bindEvents();
  },

  /** Rellenar datos del usuario en el sidebar y dropdown */
  setUser(user) {
    if (!user) return;
    const initials = (user.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const roleLabel = { ROLE_ADMIN: 'Administrador', ROLE_MANAGER: 'Jefe de Bodega', ROLE_OPERATOR: 'Repositor' }[user.role] ?? user.role;

    _set('user-avatar',     initials);
    _set('user-name',       user.name ?? '—');
    _set('user-role',       roleLabel);
    _set('profile-avatar-lg', initials);
    _set('profile-dd-name', user.name ?? '—');
    _set('profile-dd-email',user.email ?? '—');
  },

  /** Actualizar el badge numérico de un nav item */
  setBadge(badgeId, count) {
    const el = document.getElementById(badgeId);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? 'inline' : 'none';
  },

  /** Marcar el nav item activo según la ruta actual */
  setActive(route) {
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });
  },

  _bindEvents() {
    const card     = document.getElementById('user-card-btn');
    const dropdown = document.getElementById('profile-dropdown');
    if (!card || !dropdown) return;

    // Toggle dropdown
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropdown.classList.toggle('open'); }
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', () => dropdown.classList.remove('open'));

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      import('../api/auth.js').then(m => m.default.logout());
    });

    // Navegación desde dropdown
    dropdown.querySelectorAll('[data-dropdown-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        dropdown.classList.remove('open');
        window.navigate?.(btn.dataset.dropdownNav);
      });
    });

    // Mobile: hamburger (si existe)
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
  },
};

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export default Sidebar;
