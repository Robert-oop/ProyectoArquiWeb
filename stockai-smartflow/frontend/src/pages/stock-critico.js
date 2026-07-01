/**
 * pages/stock-critico.js — Productos bajo Stock_Crítico
 * Muestra cards de orden de compra sugerida, permite editar umbral.
 */
import Alerts   from '../api/alerts.js';
import Products from '../api/products.js';

const StockCritico = {
  async init(container) {
    container.innerHTML = _layout();
    await _load(container);
  },
};

async function _load(container) {
  const listEl = container.querySelector('#critical-list');
  const statsEl = container.querySelector('#critical-stats');
  if (!listEl) return;

  listEl.innerHTML = `<div style="display:flex;justify-content:center;padding:36px"><div class="spinner"></div></div>`;

  try {
    const res = await Alerts.getCriticalStock();
    const items = res?.data ?? [];

    // Stats
    const criticoCount = items.filter(p => p.stock_status === 'CRITICAL').length;
    const lowCount     = items.filter(p => p.stock_status === 'LOW').length;
    if (statsEl) {
      document.getElementById('sc-total').textContent   = items.length;
      document.getElementById('sc-critico').textContent = criticoCount;
      document.getElementById('sc-low').textContent     = lowCount;
    }

    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding:60px">
          <div class="icon">✅</div>
          <div class="title">Todos los productos sobre el umbral mínimo</div>
          <div class="desc">El sistema generará alertas automáticamente cuando el stock baje del umbral configurado.</div>
        </div>`;
      return;
    }

    listEl.innerHTML = items.map(p => _productCard(p)).join('');

    // Bind edición de umbral
    listEl.querySelectorAll('[data-edit-threshold]').forEach(btn => {
      btn.addEventListener('click', () => _editThreshold(btn.dataset.editThreshold, items, container));
    });
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="title">Error: ${err.message}</div></div>`;
  }
}

async function _editThreshold(productId, items, container) {
  const p = items.find(x => x.id === productId);
  if (!p) return;
  const current = p.threshold?.critical_stock ?? 0;
  const newVal  = prompt(`Nuevo Stock_Crítico para "${p.name}" (actual: ${current} uds):`, current);
  if (newVal === null || isNaN(newVal) || +newVal < 0) return;
  try {
    await Products.updateThreshold(productId, +newVal, p.threshold?.min_order_qty, 'Ajuste manual desde vista Stock Crítico');
    window.Toast?.success('Umbral actualizado.');
    _load(container);
  } catch (err) {
    window.Toast?.error(err.message ?? 'Error al actualizar umbral.');
  }
}

function _expiryBadge(p) {
  if (p.days_to_expiry === null || p.days_to_expiry === undefined) return '';
  const d = p.days_to_expiry;
  if (d <= 0)  return `<span class="badge badge-critical">⚠ Vencido</span>`;
  if (d <= 7)  return `<span class="badge badge-critical">🕐 Vence en ${d}d</span>`;
  if (d <= 30) return `<span class="badge badge-low">🕐 Vence en ${d}d</span>`;
  return `<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted)">Vence en ${d}d</span>`;
}

function _productCard(p) {
  const stock      = p.total_stock ?? 0;
  const min        = p.threshold?.critical_stock ?? 0;
  const deficit    = Math.max(0, min - stock);
  const suggested  = p.threshold?.min_order_qty ?? Math.max(deficit * 2, min);
  const isCritical = p.stock_status === 'CRITICAL';

  const barPct   = min > 0 ? Math.min(100, Math.round((stock / min) * 100)) : 0;
  const barColor = isCritical ? 'red' : 'amber';

  const nearestExpiry = p.nearest_expiry
    ? new Date(p.nearest_expiry).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const fefoAlert = p.fefo_alert_active
    ? `<span style="font-size:11px;color:var(--accent-red);font-weight:600">⚡ FEFO activo</span>`
    : '';

  return `
    <div class="content-card" style="margin-bottom:14px">
      <div style="padding:18px 20px">
        <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">

            <!-- Nombre + badges de estado -->
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <div style="font-weight:700;font-size:15px">${p.name}</div>
              <span class="badge ${isCritical ? 'badge-critical' : 'badge-low'}">${isCritical ? '🚨 Sin stock' : '⚠️ Stock bajo'}</span>
              ${_expiryBadge(p)}
              ${fefoAlert}
            </div>

            <!-- SKU / categoría / ubicación -->
            <div style="font-size:12px;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:12px">
              ${p.sku} · ${p.category} · ${p.location}
            </div>

            <!-- Barra de stock -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <div class="expiry-wrap" style="flex:1">
                <div class="expiry-fill" style="width:${barPct}%;background:var(--accent-${barColor})"></div>
              </div>
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;min-width:80px;text-align:right">
                ${stock} / ${min} uds
              </span>
            </div>

            <!-- Métricas en fila -->
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary)">
              <span>Déficit: <strong style="color:var(--accent-red)">${deficit} uds</strong></span>
              <span>Orden sugerida: <strong style="color:var(--accent-amber)">${suggested} uds</strong></span>
              <span>Próx. vencimiento: <strong style="color:${(p.days_to_expiry ?? 999) <= 7 ? 'var(--accent-red)' : 'var(--text-primary)'}">${nearestExpiry}</strong></span>
              <span>Algoritmo: <strong>${p.algorithm}</strong></span>
            </div>
          </div>

          <!-- Acciones -->
          <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
            <button class="purchase-btn" data-edit-threshold="${p.id}">✏ Editar umbral</button>
            <button class="btn btn-ghost btn-sm" onclick="window.navigate('/ingreso')" style="font-size:12px">＋ Ingresar stock</button>
          </div>
        </div>
      </div>
    </div>`;
}

function _layout() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Stock Crítico</div>
        <div class="page-desc">Productos bajo su umbral mínimo configurado</div>
      </div>
      <button class="btn btn-primary" onclick="window.navigate('/ingreso')">＋ Ingresar stock</button>
    </div>
    <div class="stats-grid" id="critical-stats" style="margin-bottom:20px">
      <div class="stat-card red"><div class="stat-label">Total bajo umbral</div>
        <div class="stat-value red" id="sc-total">—</div></div>
      <div class="stat-card red"><div class="stat-label">Estado Crítico (0 stock)</div>
        <div class="stat-value red" id="sc-critico">—</div></div>
      <div class="stat-card amber"><div class="stat-label">Stock Bajo</div>
        <div class="stat-value amber" id="sc-low">—</div></div>
    </div>
    <div id="critical-list"></div>`;
}

export default StockCritico;
