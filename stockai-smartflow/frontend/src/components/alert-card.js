/**
 * components/alert-card.js — Tarjeta de alerta StockAI
 *
 * Uso:
 *   AlertCard.render(type, title, desc, action?)
 *   AlertCard.critical(title, desc, actionHtml?)
 *   AlertCard.warning(title, desc, actionHtml?)
 *   AlertCard.info(title, desc, actionHtml?)
 *   AlertCard.success(title, desc, actionHtml?)
 *
 *   AlertCard.fromAPIAlert(alert, onResolve?)  → HTML de una alerta del API
 *   AlertCard.list(container, alerts, onResolve?) → renderiza lista de alertas
 */

// Iconos por tipo
const ICONS = {
  critical: '🚨',
  warning:  '⏰',
  info:     'ℹ️',
  success:  '✅',
};

// Mapa tipo de alerta del API → variante visual
const API_TYPE_MAP = {
  STOCK_CRITICAL: 'critical',
  STOCK_LOW:      'warning',
  FEFO_EXPIRY:    'warning',
  MERMA:          'info',
};

/**
 * Genera el HTML de una tarjeta de alerta.
 * @param {'critical'|'warning'|'info'|'success'} type
 * @param {string} title
 * @param {string} desc
 * @param {string} [actionHtml] — HTML del botón/badge de acción (lado derecho)
 * @returns {string}
 */
function render(type, title, desc, actionHtml = '') {
  const icon = ICONS[type] ?? 'ℹ️';
  return `
    <div class="alert-card ${type}" role="alert">
      <div class="alert-icon">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="alert-title">${_esc(title)}</div>
        ${desc ? `<div class="alert-desc">${_esc(desc)}</div>` : ''}
      </div>
      ${actionHtml ? `<div style="flex-shrink:0;margin-left:8px">${actionHtml}</div>` : ''}
    </div>`;
}

/**
 * Genera el HTML de una alerta del API REST.
 * @param {object}    alert     — objeto alerta del backend
 * @param {Function}  [onResolve] — callback(alertId) al resolver
 */
function fromAPIAlert(alert, onResolve) {
  const type    = API_TYPE_MAP[alert.type] ?? 'info';
  const prodName = alert.product?.name ?? '';
  const prodSku  = alert.product?.sku  ?? '';

  const resolveBtn = onResolve && !alert.is_resolved
    ? `<button class="btn btn-ghost btn-sm alert-resolve-btn" data-id="${_esc(alert.id)}" style="white-space:nowrap">Resolver</button>`
    : alert.is_resolved
    ? `<span style="font-size:11px;color:var(--accent-green)">✅ Resuelta</span>`
    : '';

  const desc = alert.message + (prodSku ? ` · ${prodSku}` : '');

  return render(type, prodName ? `${prodName} — ${alert.message}` : alert.message, desc, resolveBtn);
}

/**
 * Renderiza una lista de alertas en un container.
 * Bindea los botones de resolver.
 * @param {HTMLElement} container
 * @param {object[]}    alerts
 * @param {Function}    [onResolve]
 */
function list(container, alerts, onResolve) {
  if (!alerts?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔔</div>
        <div class="title">Sin alertas activas</div>
        <div class="desc">El sistema genera alertas automáticamente al detectar vencimientos o stock crítico.</div>
      </div>`;
    return;
  }

  container.innerHTML = alerts.map(a => fromAPIAlert(a, onResolve)).join('');

  if (onResolve) {
    container.querySelectorAll('.alert-resolve-btn').forEach(btn => {
      btn.addEventListener('click', () => onResolve(btn.dataset.id, btn));
    });
  }
}

// Helpers semánticos
const critical = (title, desc, action) => render('critical', title, desc, action);
const warning  = (title, desc, action) => render('warning',  title, desc, action);
const info     = (title, desc, action) => render('info',     title, desc, action);
const success  = (title, desc, action) => render('success',  title, desc, action);

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const AlertCard = { render, fromAPIAlert, list, critical, warning, info, success };
export default AlertCard;
