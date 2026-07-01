/**
 * pages/alertas.js — Centro de Alertas
 * Filtros: tipo, severidad. Resolver con nota.
 */
import Alerts    from '../api/alerts.js';
import AlertCard from '../components/alert-card.js';
import Sidebar   from '../components/sidebar.js';

const TYPES = [
  ['', 'Todas'],
  ['FEFO_EXPIRY',    '⏰ Vencimiento'],
  ['STOCK_CRITICAL', '🚨 Stock Crítico'],
  ['STOCK_LOW',      '⚠️ Stock Bajo'],
  ['MERMA',          '🗑️ Merma'],
];

let _filters = { type: '', resolved: false };
let _cont    = null;

const AlertasPage = {
  async init(container) {
    _cont = container;
    _filters = { type: '', resolved: false };
    container.innerHTML = _layout();
    _bindFilters(container);
    _bindActions(container);
    await _load(container);
  },
};

async function _load(container) {
  const box = container.querySelector('#alerts-list');
  if (!box) return;
  box.innerHTML = `<div style="display:flex;justify-content:center;padding:36px"><div class="spinner"></div></div>`;
  try {
    const res = await Alerts.list({ type: _filters.type || undefined, resolved: _filters.resolved, limit: 100 });
    const data = res?.data ?? [];
    document.getElementById('alert-count').textContent = `${data.length} alerta${data.length !== 1 ? 's' : ''}`;
    Sidebar.setBadge('badge-alerts', data.filter(a => !a.is_resolved).length);
    AlertCard.list(box, data, _filters.resolved ? null : (id, btn) => _resolve(id, btn, container));
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="title">Error cargando alertas</div><div class="desc">${err.message}</div></div>`;
  }
}

async function _resolve(alertId, btn, container) {
  const note = prompt('Describe la acción tomada para resolver esta alerta:');
  if (note === null) return;
  btn.disabled = true;
  try {
    await Alerts.resolve(alertId, note || 'Resuelta manualmente');
    window.Toast?.success('Alerta resuelta y registrada en el audit log.');
    _load(container);
  } catch (err) {
    btn.disabled = false;
    window.Toast?.error(err.message ?? 'Error al resolver.');
  }
}

function _bindActions(container) {
  container.querySelector('#btn-run-stock')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    try {
      await Alerts.runStockCheck();
      window.Toast?.success('Verificación completada. Recargando alertas…');
      await _load(container);
    } catch (err) {
      window.Toast?.error(err.message ?? 'Error al verificar stock.');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Verificar stock ahora';
    }
  });
}

function _bindFilters(container) {
  container.querySelectorAll('.filter-chip[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip[data-type]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _filters.type = chip.dataset.type;
      _load(container);
    });
  });
  container.querySelector('#toggle-resolved')?.addEventListener('change', (e) => {
    _filters.resolved = e.target.checked;
    _load(container);
  });
}

function _layout() {
  const chips = TYPES.map(([val, label]) =>
    `<button class="filter-chip${val === '' ? ' active' : ''}" data-type="${val}">${label}</button>`
  ).join('');

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Centro de Alertas</div>
        <div class="page-desc" id="alert-count">Cargando…</div>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-run-stock">🔄 Verificar stock ahora</button>
    </div>
    <div class="content-card" style="margin-bottom:16px">
      <div class="card-body" style="padding:14px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div class="filter-bar" style="margin:0">${chips}</div>
          <label class="toggle-wrap">
            <div class="toggle" id="toggle-resolved-visual"></div>
            <span style="font-size:13px;color:var(--text-secondary)">Mostrar resueltas</span>
            <input type="checkbox" id="toggle-resolved" style="display:none"/>
          </label>
        </div>
      </div>
    </div>
    <div id="alerts-list"></div>`;
}

// Toggle visual binding
document.addEventListener('change', (e) => {
  if (e.target.id === 'toggle-resolved') {
    document.getElementById('toggle-resolved-visual')?.classList.toggle('on', e.target.checked);
  }
});

export default AlertasPage;
