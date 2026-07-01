/**
 * main.js — Entry point de la SPA StockAI SmartFlow
 *
 * Responsabilidades:
 *  1. Importar CSS del design system
 *  2. Verificar sesión JWT activa
 *  3. Si no autenticado → mostrar login screen
 *  4. Si autenticado → montar app (sidebar, topbar, router)
 *  5. Registrar listeners globales (auth:expired, notificaciones)
 *  6. Iniciar router SPA
 */

// ── CSS (Vite los procesa y los inyecta en el bundle) ─────────────────────────
import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

// ── Módulos ───────────────────────────────────────────────────────────────────
import Auth   from './api/auth.js';
import router from './router.js';

// ── Arranque ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Redirigir a login si no hay sesión
  if (!Auth.isLoggedIn()) {
    _showLogin();
    return;
  }

  // Verificar que el token siga siendo válido
  try {
    await Auth.me();
  } catch {
    Auth.logout();  // limpia sessionStorage + recarga
    return;
  }

  _mountApp();
});

// ── Login ─────────────────────────────────────────────────────────────────────
function _showLogin() {
  const screen = document.getElementById('login-screen');
  if (screen) screen.style.display = 'flex';
  _bindLoginForm();
}

function _bindLoginForm() {
  const btn = document.getElementById('btn-login');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const email    = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const mfa      = document.getElementById('mfa')?.value?.trim();

    if (!email || !password) {
      _showLoginError('Ingresa tu correo y contraseña.');
      return;
    }

    btn.disabled = true;
    const loginText    = document.getElementById('login-text');
    const loginSpinner = document.getElementById('login-spinner');
    if (loginText)    loginText.style.display    = 'none';
    if (loginSpinner) loginSpinner.style.display = 'block';

    try {
      await Auth.login(email, password, mfa);
      window.location.reload();
    } catch (err) {
      _showLoginError(err.message || 'Credenciales inválidas. Intenta nuevamente.');
      btn.disabled = false;
      if (loginText)    loginText.style.display    = 'inline';
      if (loginSpinner) loginSpinner.style.display = 'none';
    }
  });

  // Submit con Enter
  document.getElementById('mfa')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}

function _showLoginError(msg) {
  let el = document.getElementById('login-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'login-error';
    el.style.cssText = 'color:var(--accent-red);font-size:13px;text-align:center;margin-top:12px;';
    document.querySelector('.login-card')?.appendChild(el);
  }
  el.textContent = msg;
}

// ── Montar App ────────────────────────────────────────────────────────────────
function _mountApp() {
  // Ocultar login screen
  const screen = document.getElementById('login-screen');
  if (screen) screen.style.display = 'none';

  // Mostrar estructura principal
  const sidebar = document.getElementById('sidebar');
  const main    = document.querySelector('.main-layout');
  if (sidebar) sidebar.style.display = 'flex';
  if (main)    main.style.display    = 'flex';

  // Rellenar datos del usuario en el sidebar
  _populateUser();

  // Listener: sesión expirada (token no renovable)
  window.addEventListener('auth:expired', () => {
    _toast('Tu sesión ha expirado. Inicia sesión nuevamente.', 'warning');
    setTimeout(() => Auth.logout(), 2000);
  });

  // Botones de usuario (configuración + logout)
  _bindUserActions();

  // Sidebar hamburger toggle (mobile)
  _bindSidebarToggle();

  // Iniciar router SPA
  router.init('#page-content', '#topbar-title');

  // Sync bottom nav estado inicial
  const initialPath = location.pathname === '/' ? '/dashboard' : location.pathname;
  _syncBottomNav(initialPath);

  // Envolver navigate para cerrar sidebar + sincronizar bottom nav en mobile
  const _origNavigate = window.navigate;
  window.navigate = (path) => {
    _origNavigate(path);
    if (window.matchMedia('(max-width: 768px)').matches) _closeSidebar();
    _syncBottomNav(path);
  };
}

function _populateUser() {
  const user = Auth.currentUser();
  if (!user) return;

  const initials = user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const role     = { ROLE_ADMIN: 'Administrador', ROLE_MANAGER: 'Jefe de Bodega', ROLE_OPERATOR: 'Repositor' }[user.role] || user.role;

  const avatarEl = document.getElementById('user-avatar');
  const nameEl   = document.getElementById('user-name');
  const roleEl   = document.getElementById('user-role');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = user.name;
  if (roleEl)   roleEl.textContent   = role;

  // También poblar el profile dropdown si existe
  const ddName  = document.querySelector('.profile-dd-name');
  const ddEmail = document.querySelector('.profile-dd-email');
  if (ddName)  ddName.textContent  = user.name;
  if (ddEmail) ddEmail.textContent = user.email;
}

function _bindUserActions() {
  // Logout directo
  document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());

  // Abrir modal de configuración
  document.getElementById('btn-settings')?.addEventListener('click', _openSettings);

  // Cerrar modal: botón X
  document.getElementById('btn-close-settings')?.addEventListener('click', _closeSettings);

  // Cerrar modal: clic en el overlay (fuera del panel)
  document.getElementById('modal-settings')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _closeSettings();
  });

  // Cerrar modal: tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeSettings();
  });

  // Checklist de requisitos en tiempo real
  document.getElementById('settings-new-pw')?.addEventListener('input', (e) => {
    _checkPwRequirements(e.target.value);
  });

  // Formulario cambio de contraseña
  document.getElementById('btn-change-pw')?.addEventListener('click', _submitChangePassword);

  // Confirmar con Enter en el último campo
  document.getElementById('settings-confirm-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _submitChangePassword();
  });
}

function _openSettings() {
  const user     = Auth.currentUser();
  const modal    = document.getElementById('modal-settings');
  if (!modal || !user) return;

  const initials = user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roleLabel = {
    ROLE_ADMIN:    'Administrador',
    ROLE_MANAGER:  'Jefe de Bodega',
    ROLE_OPERATOR: 'Repositor',
  }[user.role] || user.role;

  document.getElementById('settings-avatar').textContent = initials;
  document.getElementById('settings-name').textContent   = user.name  || '—';
  document.getElementById('settings-email').textContent  = user.email || '—';
  document.getElementById('settings-role').textContent   = roleLabel;

  // Limpiar formulario al abrir
  ['settings-current-pw', 'settings-new-pw', 'settings-confirm-pw'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _checkPwRequirements('');
  _setPwError('');

  modal.style.display = 'flex';
  document.getElementById('settings-current-pw')?.focus();
}

function _closeSettings() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.style.display = 'none';
}

function _checkPwRequirements(pw) {
  const checks = {
    'req-len':     pw.length >= 8,
    'req-upper':   /[A-Z]/.test(pw),
    'req-lower':   /[a-z]/.test(pw),
    'req-num':     /[0-9]/.test(pw),
    'req-special': /[^A-Za-z0-9]/.test(pw),
  };
  Object.entries(checks).forEach(([id, met]) => {
    document.getElementById(id)?.classList.toggle('met', met);
  });
  return Object.values(checks).every(Boolean);
}

function _setPwError(msg) {
  const el = document.getElementById('settings-pw-error');
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
  else       el.style.display = 'none';
}

async function _submitChangePassword() {
  const currentPw = document.getElementById('settings-current-pw')?.value;
  const newPw     = document.getElementById('settings-new-pw')?.value;
  const confirmPw = document.getElementById('settings-confirm-pw')?.value;

  // Validaciones locales
  if (!currentPw) return _setPwError('Ingresa tu contraseña actual.');
  if (!_checkPwRequirements(newPw || '')) return _setPwError('La nueva contraseña no cumple todos los requisitos.');
  if (newPw !== confirmPw) return _setPwError('Las contraseñas no coinciden.');
  if (currentPw === newPw) return _setPwError('La nueva contraseña debe ser diferente a la actual.');
  _setPwError('');

  // Spinner
  const btn     = document.getElementById('btn-change-pw');
  const textEl  = document.getElementById('change-pw-text');
  const spinner = document.getElementById('change-pw-spinner');
  if (btn) btn.disabled = true;
  if (textEl)  textEl.style.display  = 'none';
  if (spinner) spinner.style.display = 'block';

  try {
    await Auth.changePassword(currentPw, newPw);
    _closeSettings();
    window.Toast?.success('Contraseña actualizada correctamente.');
  } catch (err) {
    _setPwError(err.message || 'Error al actualizar la contraseña.');
  } finally {
    if (btn)     btn.disabled        = false;
    if (textEl)  textEl.style.display  = 'inline';
    if (spinner) spinner.style.display = 'none';
  }
}

// ── Toast global (accesible desde cualquier página) ───────────────────────────
const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function _toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:16px">${TOAST_ICONS[type] ?? 'ℹ️'}</span><span>${message}</span>`;
  container.prepend(el);

  setTimeout(() => {
    el.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => el.remove(), 300);
  }, 4500);
}

// Exponer toast globalmente para que las páginas puedan usarlo
window.Toast = {
  success: (m) => _toast(m, 'success'),
  error:   (m) => _toast(m, 'error'),
  warning: (m) => _toast(m, 'warning'),
  info:    (m) => _toast(m, 'info'),
};

// Exponer router globalmente para navegación desde HTML (onclick)
// (se sobreescribe en _mountApp para añadir cierre de sidebar en mobile)
window.navigate = (path) => router.navigate(path);

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
function _closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

function _bindSidebarToggle() {
  const hamburger = document.getElementById('btn-hamburger');
  const overlay   = document.getElementById('sidebar-overlay');
  const sidebar   = document.getElementById('sidebar');

  hamburger?.addEventListener('click', () => {
    const isOpen = sidebar?.classList.contains('open');
    if (isOpen) {
      _closeSidebar();
    } else {
      sidebar?.classList.add('open');
      overlay?.classList.add('active');
    }
  });

  overlay?.addEventListener('click', _closeSidebar);
}

// ── Bottom nav: sincronizar item activo ───────────────────────────────────────
function _syncBottomNav(path) {
  document.querySelectorAll('.bottom-nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === path);
  });
}
