/**
 * pages/fefo.js — Cola de prioridad FEFO
 *
 * Muestra lotes P1/P2/P3 ordenados por fecha_alerta ASC.
 * Acciones: consumir (despachar) y dar de baja por merma.
 * Auto-refresh cada 60s. Filtros: días, solo alertas.
 */
import Batches from '../api/batches.js';
import Table   from '../components/table.js';

let _filters = { days: 30, onlyAlerts: false };
let _timer   = null;
let _cont    = null;

const FEFO = {
  async init(container) {
    _cont = container;
    _filters = { days: 30, onlyAlerts: false };
    container.innerHTML = _layout();
    _bindControls(container);
    await _load(container);
    clearInterval(_timer);
    _timer = setInterval(() => _load(container), 60_000);
    window.addEventListener('popstate', () => clearInterval(_timer), { once: true });
  },
};

async function _load(container) {
  const tableEl = container.querySelector('#fefo-table');
  if (!tableEl) return;
  Table.loading(tableEl);

  try {
    const res     = await Batches.getExpiring({ days: _filters.days, limit: 100 });
    let   batches = res?.data ?? [];

    if (_filters.onlyAlerts) {
      batches = batches.filter(b => b.algorithm_alert);
    }

    // Contadores para chips de resumen
    const p1 = batches.filter(b => b.fefo_priority === 'P1').length;
    const p2 = batches.filter(b => b.fefo_priority === 'P2').length;
    const p3 = batches.filter(b => b.fefo_priority === 'P3').length;
    _setCount('fefo-count-p1', p1);
    _setCount('fefo-count-p2', p2);
    _setCount('fefo-count-p3', p3);
    _setCount('fefo-total',    batches.length);
    document.getElementById('fefo-last-update').textContent =
      `Actualizado: ${new Date().toLocaleTimeString('es-CL')}`;

    Table.fefo(tableEl, batches, {
      onConsume: (id) => _openConsumeModal(id, batches, container),
      onVoid:    (id) => _openVoidModal(id, batches, container),
    });
  } catch (err) {
    Table.empty(tableEl, '❌', 'Error al cargar la cola FEFO', err.message);
    window.Toast?.error('Error cargando FEFO.');
  }
}

// ── Modal de consumo ──────────────────────────────────────────────────────────
function _openConsumeModal(batchId, batches, container) {
  const batch   = batches.find(b => b.id === batchId);
  const product = batch?.product ?? {};
  const modal   = _buildModal(`
    <div class="card-header" style="background:var(--accent-cyan-dim)">
      <div class="card-title">📦 Despachar a Zona de Ventas</div>
      <button class="btn btn-ghost btn-sm" id="modal-close">✕</button>
    </div>
    <div class="card-body">
      <div class="alert-card info" style="margin-bottom:16px">
        <div class="alert-icon">📦</div>
        <div>
          <div class="alert-title">${_esc(product.name ?? '—')}</div>
          <div class="alert-desc">Lote: ${_esc(batch?.lot_number ?? '—')} · Vence: ${batch?.expiry_date ?? '—'} · Stock: ${batch?.quantity ?? 0} uds</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Cantidad a despachar *</label>
        <input id="consume-qty" class="form-input" type="number" min="1" max="${batch?.quantity ?? 9999}" value="1" style="font-size:22px;text-align:center;font-weight:700"/>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Máximo disponible: ${batch?.quantity ?? 0} unidades</div>
      </div>
      <div class="form-group">
        <label class="form-label">Observación (opcional)</label>
        <input id="consume-notes" class="form-input" placeholder="Destino, repositor, zona…"/>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-ghost" id="modal-cancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" id="btn-do-consume" style="flex:2;justify-content:center">Confirmar Despacho</button>
      </div>
    </div>`);

  document.body.appendChild(modal);

  modal.querySelector('#modal-close')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#modal-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#btn-do-consume')?.addEventListener('click', async () => {
    const qty   = +modal.querySelector('#consume-qty')?.value;
    const notes = modal.querySelector('#consume-notes')?.value?.trim();
    if (!qty || qty < 1) { window.Toast?.warning('Ingresa una cantidad válida.'); return; }
    if (qty > (batch?.quantity ?? 0)) { window.Toast?.warning('Cantidad supera el stock disponible.'); return; }

    const btn = modal.querySelector('#btn-do-consume');
    btn.disabled = true; btn.textContent = 'Despachando…';
    try {
      await Batches.consume(batchId, qty, notes);
      modal.remove();
      window.Toast?.success(`✅ ${qty} uds despachadas. FEFO actualizado.`);
      _load(container);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Confirmar Despacho';
      window.Toast?.error(err.message ?? 'Error al despachar.');
    }
  });
}

// ── Modal de baja por merma ───────────────────────────────────────────────────
function _openVoidModal(batchId, batches, container) {
  const batch   = batches.find(b => b.id === batchId);
  const product = batch?.product ?? {};
  const modal   = _buildModal(`
    <div class="card-header" style="background:var(--accent-red-dim)">
      <div class="card-title" style="color:var(--accent-red)">🗑️ Baja por Merma</div>
      <button class="btn btn-ghost btn-sm" id="modal-close">✕</button>
    </div>
    <div class="card-body">
      <div class="alert-card critical" style="margin-bottom:16px">
        <div class="alert-icon">⚠️</div>
        <div>
          <div class="alert-title">${_esc(product.name ?? '—')}</div>
          <div class="alert-desc">Lote: ${_esc(batch?.lot_number ?? '—')} · Stock actual: ${batch?.quantity ?? 0} uds</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Motivo de la baja *</label>
        <select id="void-reason-preset" class="form-select">
          <option value="">— Selecciona un motivo —</option>
          <option value="Producto vencido — no apto para venta">Producto vencido</option>
          <option value="Daño físico en el embalaje">Daño en embalaje</option>
          <option value="Rotura durante traslado">Rotura en traslado</option>
          <option value="Contaminación detectada">Contaminación</option>
          <option value="Error de ingreso — lote incorrecto">Error de ingreso</option>
          <option value="otro">Otro (especificar)</option>
        </select>
        <input id="void-reason" class="form-input" placeholder="Describir motivo…" style="margin-top:8px;display:none"/>
      </div>
      <div class="form-group">
        <label class="form-label">Cantidad afectada (vacío = total)</label>
        <input id="void-qty" class="form-input" type="number" min="1" max="${batch?.quantity ?? 9999}" placeholder="${batch?.quantity ?? 0} (todo el lote)"/>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-ghost" id="modal-cancel" style="flex:1">Cancelar</button>
        <button class="btn btn-danger" id="btn-do-void" style="flex:2;justify-content:center">Confirmar Baja</button>
      </div>
    </div>`);

  document.body.appendChild(modal);

  modal.querySelector('#modal-close')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#modal-cancel')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#void-reason-preset')?.addEventListener('change', (e) => {
    const custom = modal.querySelector('#void-reason');
    if (custom) custom.style.display = e.target.value === 'otro' ? 'block' : 'none';
  });

  modal.querySelector('#btn-do-void')?.addEventListener('click', async () => {
    const preset = modal.querySelector('#void-reason-preset')?.value;
    const custom = modal.querySelector('#void-reason')?.value?.trim();
    const reason = preset === 'otro' ? custom : preset;
    const qty    = modal.querySelector('#void-qty')?.value;

    if (!reason || reason.length < 5) { window.Toast?.warning('Describe el motivo de la baja.'); return; }

    const btn = modal.querySelector('#btn-do-void');
    btn.disabled = true; btn.textContent = 'Dando de baja…';
    try {
      await Batches.void(batchId, reason, qty ? +qty : null);
      modal.remove();
      window.Toast?.success('Baja registrada. Merma auditada.');
      _load(container);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Confirmar Baja';
      window.Toast?.error(err.message ?? 'Error al dar de baja.');
    }
  });
}

// ── Modal base ────────────────────────────────────────────────────────────────
function _buildModal(innerHtml) {
  const modal = document.createElement('div');
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9000;animation:fadeIn 0.2s ease`;
  modal.innerHTML = `<div class="content-card" style="width:100%;max-width:460px;margin:16px;max-height:90vh;overflow-y:auto">${innerHtml}</div>`;
  return modal;
}

// ── Controles ─────────────────────────────────────────────────────────────────
function _bindControls(container) {
  container.querySelector('#btn-only-alerts')?.addEventListener('click', (e) => {
    _filters.onlyAlerts = !_filters.onlyAlerts;
    e.target.classList.toggle('active', _filters.onlyAlerts);
    e.target.textContent = _filters.onlyAlerts ? '✓ Solo alertas' : 'Solo alertas';
    _load(container);
  });

  container.querySelector('#fefo-days-select')?.addEventListener('change', (e) => {
    _filters.days = +e.target.value;
    _load(container);
  });

  container.querySelector('#btn-fefo-refresh')?.addEventListener('click', () => _load(container));
}

function _setCount(id, n) { const el = document.getElementById(id); if (el) el.textContent = n; }
function _esc(s) { return String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Layout ────────────────────────────────────────────────────────────────────
function _layout() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">FEFO — Cola de Despacho</div>
        <div class="page-desc">Lotes ordenados por fecha_alerta · Algoritmo 70/30 y 60/40</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <span style="font-size:11px;color:var(--text-muted)" id="fefo-last-update"></span>
        <button class="btn btn-ghost btn-sm" id="btn-fefo-refresh">↻ Actualizar</button>
      </div>
    </div>

    <!-- Resumen de prioridades -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card red">
        <div class="stat-label">P1 — Urgente</div>
        <div class="stat-value red" id="fefo-count-p1">—</div>
        <div class="stat-sub">despachar inmediatamente</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label">P2 — Próximo</div>
        <div class="stat-value amber" id="fefo-count-p2">—</div>
        <div class="stat-sub">despachar esta semana</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">P3 — Normal</div>
        <div class="stat-value green" id="fefo-count-p3">—</div>
        <div class="stat-sub">dentro del plazo</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-label">Total en cola</div>
        <div class="stat-value cyan" id="fefo-total">—</div>
        <div class="stat-sub">lotes activos</div>
      </div>
    </div>

    <!-- Filtros y tabla -->
    <div class="content-card">
      <div class="card-header">
        <div class="card-title">📋 Cola de Prioridad</div>
        <div style="display:flex;gap:10px;align-items:center">
          <select id="fefo-days-select" class="form-select" style="width:auto;padding:6px 12px;font-size:12px">
            <option value="7">7 días</option>
            <option value="14">14 días</option>
            <option value="30" selected>30 días</option>
            <option value="60">60 días</option>
          </select>
          <button class="btn btn-ghost btn-sm" id="btn-only-alerts">Solo alertas</button>
        </div>
      </div>
      <div id="fefo-table"></div>
    </div>`;
}

export default FEFO;
