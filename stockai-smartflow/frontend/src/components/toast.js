/**
 * components/toast.js — Sistema de notificaciones flotantes StockAI
 *
 * Uso:
 *   Toast.success('Lote registrado correctamente.')
 *   Toast.error('Error al conectar con el servidor.')
 *   Toast.warning('Stock bajo el mínimo crítico.')
 *   Toast.info('Sesión renovada automáticamente.')
 */

const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
const DURATION = 4500;

function _getContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function show(message, type = 'info') {
  const container = _getContainer();

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <span style="font-size:16px;flex-shrink:0">${ICONS[type] ?? 'ℹ️'}</span>
    <span style="flex:1">${String(message)}</span>
    <button
      style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:16px;flex-shrink:0"
      aria-label="Cerrar"
    >×</button>
  `;

  // Cerrar manualmente
  el.querySelector('button').addEventListener('click', () => _dismiss(el));

  container.prepend(el);

  // Auto-dismiss
  const timer = setTimeout(() => _dismiss(el), DURATION);
  el._timer = timer;

  return el;
}

function _dismiss(el) {
  clearTimeout(el._timer);
  el.style.animation = 'slideIn 0.3s ease reverse';
  setTimeout(() => el.remove(), 280);
}

const Toast = {
  success: (msg) => show(msg, 'success'),
  error:   (msg) => show(msg, 'error'),
  warning: (msg) => show(msg, 'warning'),
  info:    (msg) => show(msg, 'info'),
  show,
};

export default Toast;
