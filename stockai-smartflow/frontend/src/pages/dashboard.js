/**
 * pages/dashboard.js — Dashboard principal StockAI
 * Muestra: 4 métricas, cola FEFO top-5, alertas recientes, stock crítico.
 */
import Products  from '../api/products.js';
import Batches   from '../api/batches.js';
import Alerts    from '../api/alerts.js';
import Table     from '../components/table.js';
import AlertCard from '../components/alert-card.js';
import Sidebar   from '../components/sidebar.js';

let _timer = null;

const Dashboard = {
  async init(container) {
    container.innerHTML = _skeleton();
    await _load(container);
    clearInterval(_timer);
    _timer = setInterval(() => _load(container), 60_000);
    window.addEventListener('popstate', () => clearInterval(_timer), { once: true });
  },
};

async function _load(container) {
  try {
    const [pRes, bRes, aRes, cRes] = await Promise.allSettled([
      Products.list({ limit: 100 }),
      Batches.getExpiring({ days: 30, limit: 5 }),
      Alerts.list({ limit: 5 }),
      Alerts.getCriticalStock(),
    ]);

    const total    = pRes.value?.meta?.total ?? 0;
    const batches  = bRes.value?.data ?? [];
    const alerts   = aRes.value?.data ?? [];
    const critical = cRes.value?.data ?? [];
    const pct      = total > 0 ? Math.round(100 - (critical.length / total) * 100) : 100;

    _stat('stat-total',   total,        'cyan');
    _stat('stat-fefo',    batches.length, batches.length > 0 ? 'amber' : 'green');
    _stat('stat-critico', critical.length, critical.length > 0 ? 'red' : 'green');
    _stat('stat-status',  `${pct}%`,    pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red');

    Sidebar.setBadge('badge-fefo',    batches.length);
    Sidebar.setBadge('badge-critico', critical.length);
    Sidebar.setBadge('badge-alertas', alerts.length);

    const fefoEl = container.querySelector('#dash-fefo');
    if (fefoEl) {
      batches.length
        ? Table.fefo(fefoEl, batches, { onConsume: (id) => _consume(id, container) })
        : Table.empty(fefoEl, '✅', 'Sin lotes con alerta activa');
    }

    const alertsEl = container.querySelector('#dash-alerts');
    if (alertsEl) AlertCard.list(alertsEl, alerts, (id, btn) => _resolve(id, btn, container));

    const critEl = container.querySelector('#dash-critical');
    if (critEl) {
      critEl.innerHTML = critical.length
        ? critical.slice(0, 4).map(p => `
            <div class="purchase-card" style="margin-bottom:10px">
              <div class="purchase-icon">⚠️</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px">${_esc(p.name)}</div>
                <div class="col-mono" style="font-size:11px">${_esc(p.sku)}</div>
                <div style="font-size:12px;color:var(--accent-red);margin-top:2px">
                  Stock: ${p.total_stock ?? 0} / Mín: ${p.threshold?.critical_stock ?? 0}
                </div>
              </div>
              <button class="purchase-btn" onclick="window.navigate('/stock-critico')">Ver →</button>
            </div>`).join('')
        : `<div class="empty-state" style="padding:24px"><div class="icon">✅</div><div class="title">Sin stock crítico</div></div>`;
    }
  } catch (err) {
    console.error('[Dashboard]', err);
    window.Toast?.error('No se pudo cargar el dashboard.');
  }
}

async function _consume(batchId, container) {
  const qty = prompt('¿Cuántas unidades despachar?', '1');
  if (!qty || isNaN(qty) || +qty < 1) return;
  try {
    await Batches.consume(batchId, +qty);
    window.Toast?.success('Lote despachado. FEFO actualizado.');
    _load(container);
  } catch (err) { window.Toast?.error(err.message); }
}

async function _resolve(id, btn, container) {
  btn.disabled = true;
  try {
    await Alerts.resolve(id, 'Resuelta desde dashboard');
    window.Toast?.success('Alerta resuelta.');
    _load(container);
  } catch (err) { btn.disabled = false; window.Toast?.error(err.message); }
}

function _stat(id, value, color) {
  const el = document.getElementById(id);
  if (el) { el.textContent = String(value); el.className = `stat-value ${color}`; }
}

function _esc(s) { return String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _skeleton() {
  const sc = (id, val, color, icon, label, sub) => `
    <div class="stat-card ${color}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-value ${color}" id="${id}">${val}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;

  return `
    <div class="stats-grid">
      ${sc('stat-total',   '—','cyan', '📦','Total Productos',   'productos activos')}
      ${sc('stat-fefo',    '—','amber','⏰','Cola FEFO Activa',  'activan 70/30 o 60/40')}
      ${sc('stat-critico', '—','red',  '🚨','Stock Crítico',     'bajo umbral mínimo')}
      ${sc('stat-status',  '—','green','✅','Disponibilidad',    'productos en buen estado')}
    </div>
    <div class="content-card" style="margin-bottom:20px">
      <div class="card-header">
        <div><div class="card-title">⏰ Cola FEFO — próximos 30 días</div>
          <div class="card-sub">Lotes que activaron el algoritmo 70/30 o 60/40</div></div>
        <button class="btn btn-ghost btn-sm" onclick="window.navigate('/fefo')">Ver todos →</button>
      </div>
      <div id="dash-fefo"><div style="display:flex;justify-content:center;padding:36px"><div class="spinner"></div></div></div>
    </div>
    <div class="grid-2">
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">🔔 Alertas recientes</div>
          <button class="btn btn-ghost btn-sm" onclick="window.navigate('/alertas')">Ver todas →</button>
        </div>
        <div class="card-body" id="dash-alerts"><div style="display:flex;justify-content:center;padding:24px"><div class="spinner"></div></div></div>
      </div>
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">🚨 Stock Crítico</div>
          <button class="btn btn-ghost btn-sm" onclick="window.navigate('/stock-critico')">Ver todos →</button>
        </div>
        <div class="card-body" id="dash-critical"><div style="display:flex;justify-content:center;padding:24px"><div class="spinner"></div></div></div>
      </div>
    </div>`;
}

export default Dashboard;
