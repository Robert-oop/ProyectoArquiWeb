/**
 * components/table.js — Tabla de datos reutilizable StockAI
 *
 * Uso principal:
 *   Table.fefo(container, batches)          → tabla FEFO P1/P2/P3
 *   Table.products(container, products)     → inventario completo
 *   Table.alerts(container, alerts, onResolve) → centro de alertas
 *   Table.audit(container, logs)            → audit log
 *   Table.empty(container, icon, text)      → estado vacío genérico
 *   Table.loading(container)               → spinner de carga
 */

// Escapar HTML para prevenir XSS
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function priceFmt(n) {
  return n != null ? `$${Number(n).toLocaleString('es-CL')}` : '—';
}

// Badges reutilizables
function priorityBadge(p) {
  const map = { P1: 'badge-p1', P2: 'badge-p2', P3: 'badge-p3' };
  const dot = { P1: '🔴', P2: '🟡', P3: '🟢' };
  return `<span class="badge ${map[p] ?? 'badge-ghost'}">${p} ${dot[p] ?? ''}</span>`;
}

function statusBadge(status) {
  const map = {
    CRITICAL: ['badge-critical', '🚨 Crítico'],
    LOW:      ['badge-low',      '⚠️ Bajo'],
    NORMAL:   ['badge-normal',   '✅ Normal'],
  };
  const [cls, label] = map[status] ?? ['badge-ghost', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function alertTypeBadge(type) {
  const map = {
    FEFO_EXPIRY:    ['badge-p1',      '⏰ Vencimiento'],
    STOCK_CRITICAL: ['badge-critical','🚨 Stock Crítico'],
    STOCK_LOW:      ['badge-low',     '⚠️ Stock Bajo'],
    MERMA:          ['badge-ghost',   '🗑️ Merma'],
  };
  const [cls, label] = map[type] ?? ['badge-ghost', type];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Loading / Empty states ────────────────────────────────────────────────────
function loading(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;padding:48px">
      <div class="spinner spinner-lg"></div>
    </div>`;
}

function empty(container, icon = '📦', text = 'Sin datos disponibles', sub = '') {
  container.innerHTML = `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <div class="title">${esc(text)}</div>
      ${sub ? `<div class="desc">${esc(sub)}</div>` : ''}
    </div>`;
}

// ── Tabla FEFO (lotes por prioridad de despacho) ──────────────────────────────
function fefo(container, batches, { onConsume, onVoid } = {}) {
  if (!batches?.length) { empty(container, '🥛', 'No hay lotes con alerta activa', 'Los lotes aparecerán aquí cuando activen el algoritmo 70/30 o 60/40.'); return; }

  const rows = batches.map((b) => {
    const daysLeft  = b.days_to_expiry ?? '—';
    const daysColor = daysLeft <= 7 ? 'var(--accent-red)' : daysLeft <= 14 ? 'var(--accent-amber)' : 'var(--text-primary)';
    const isAlert   = b.algorithm_alert;

    return `
      <tr class="${isAlert ? 'alert-row' : ''}">
        <td>${priorityBadge(b.fefo_priority ?? 'P3')}</td>
        <td>
          <div class="col-name">${esc(b.product?.name ?? b.name ?? '—')}</div>
          <div class="col-mono" style="font-size:11px">${esc(b.lot_number ?? '')}</div>
        </td>
        <td style="font-family:var(--font-mono);color:${daysColor}">${daysLeft} días</td>
        <td class="col-mono">${esc(b.quantity ?? '—')} uds</td>
        <td><span class="loc-chip">${esc(b.location_bodega ?? b.product?.location ?? '—')}</span></td>
        <td style="font-family:var(--font-mono);font-size:12px">${fmtDate(b.expiry_date)}</td>
        <td>${b.life_remaining_pct != null ? `<span style="color:${b.life_remaining_pct <= 30 ? 'var(--accent-red)' : 'var(--accent-amber)'}">${b.life_remaining_pct}%</span>` : '—'}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${onConsume ? `<button class="btn btn-ghost btn-sm" data-batch-id="${esc(b.id)}" data-action="consume">Despachar</button>` : ''}
            ${onVoid    ? `<button class="btn btn-danger btn-sm" data-batch-id="${esc(b.id)}" data-action="void" style="font-size:11px">Merma</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>FEFO</th><th>Producto / Lote</th><th>Vence en</th>
            <th>Stock</th><th>Ubicación</th><th>Vencimiento</th><th>Vida útil</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Bindear acciones
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.batchId;
      if (btn.dataset.action === 'consume' && onConsume) onConsume(id);
      if (btn.dataset.action === 'void'    && onVoid)    onVoid(id);
    });
  });
}

// ── Tabla de productos (inventario completo) ──────────────────────────────────
function products(container, items, { onEdit, onPrice, onThreshold } = {}) {
  if (!items?.length) { empty(container, '📦', 'Sin productos registrados', 'Usa "Ingreso rápido" para agregar tu primer producto.'); return; }

  const rows = items.map((p) => `
    <tr>
      <td>
        <div class="col-name">${esc(p.name)}</div>
        <div class="col-mono" style="font-size:11px">${esc(p.sku)}</div>
      </td>
      <td><span class="badge badge-cyan" style="font-size:10px">${esc(p.category)}</span></td>
      <td class="col-mono" style="color:${p.stock_status === 'CRITICAL' ? 'var(--accent-red)' : p.stock_status === 'LOW' ? 'var(--accent-amber)' : 'var(--text-primary)'}">
        ${p.total_stock ?? '—'}
      </td>
      <td class="col-mono">${p.threshold?.critical_stock ?? '—'}</td>
      <td class="col-mono" style="color:${p.algorithm_alert ? 'var(--accent-amber)' : 'var(--text-muted)'}">
        ${fmtDate(p.nearest_expiry)}
      </td>
      <td><span class="loc-chip">${esc(p.location ?? '—')}</span></td>
      <td class="col-mono">${priceFmt(p.price_sale)}</td>
      <td>${statusBadge(p.stock_status ?? 'NORMAL')}</td>
      <td>
        <div style="display:flex;gap:6px">
          ${onPrice ? `<button class="btn btn-ghost btn-sm" data-id="${esc(p.id)}" data-action="price">✏ Precio</button>` : ''}
          ${onEdit  ? `<button class="btn btn-ghost btn-sm" data-id="${esc(p.id)}" data-action="edit">Lotes</button>` : ''}
        </div>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Producto / SKU</th><th>Categoría</th><th>Stock</th><th>Mín.</th>
            <th>Vencimiento</th><th>Ubicación</th><th>Precio</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'price' && onPrice) onPrice(id);
      if (btn.dataset.action === 'edit'  && onEdit)  onEdit(id);
    });
  });
}

// ── Tabla de alertas ──────────────────────────────────────────────────────────
function alerts(container, items, { onResolve } = {}) {
  if (!items?.length) { empty(container, '🔔', 'Sin alertas activas', 'El sistema generará alertas automáticamente cuando detecte vencimientos o stock crítico.'); return; }

  const rows = items.map((a) => `
    <tr>
      <td>${alertTypeBadge(a.type)}</td>
      <td>
        <div class="col-name">${esc(a.product?.name ?? '—')}</div>
        <div class="col-mono" style="font-size:11px">${esc(a.product?.sku ?? '')}</div>
      </td>
      <td style="font-size:13px;color:var(--text-secondary);max-width:300px">${esc(a.message)}</td>
      <td class="col-mono" style="font-size:12px;color:var(--text-muted)">${fmtDate(a.created_at)}</td>
      <td>
        ${onResolve && !a.is_resolved
          ? `<button class="btn btn-ghost btn-sm" data-alert-id="${esc(a.id)}" data-action="resolve">Resolver</button>`
          : `<span style="font-size:12px;color:var(--accent-green)">✅ Resuelta</span>`
        }
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr><th>Tipo</th><th>Producto</th><th>Mensaje</th><th>Fecha</th><th>Acción</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('[data-action="resolve"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onResolve) onResolve(btn.dataset.alertId, btn);
    });
  });
}

// ── Tabla de audit log ────────────────────────────────────────────────────────
function audit(container, logs) {
  if (!logs?.length) { empty(container, '📋', 'Sin registros de auditoría'); return; }

  const ACTION_COLORS = {
    BATCH_CREATED:    'var(--accent-green)',
    BATCH_CONSUMED:   'var(--accent-cyan)',
    BATCH_VOID:       'var(--accent-amber)',
    PRODUCT_UPDATED:  'var(--accent-cyan)',
    LOGIN:            'var(--accent-green)',
    LOGOUT:           'var(--text-muted)',
  };

  const rows = logs.map((l) => `
    <tr>
      <td class="col-mono" style="font-size:11px;color:var(--text-muted)">${fmtDate(l.created_at)}</td>
      <td>
        <div style="font-size:12px;font-weight:600">${esc(l.actor?.name ?? '—')}</div>
        <div class="col-mono" style="font-size:10px">${esc(l.actor?.role ?? '')}</div>
      </td>
      <td><code style="font-size:11px;color:${ACTION_COLORS[l.action] ?? 'var(--text-secondary)'}">${esc(l.action)}</code></td>
      <td class="col-mono" style="font-size:11px">${esc(l.entity)}</td>
      <td style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${esc(l.ip_address ?? '—')}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>IP</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

const Table = { fefo, products, alerts, audit, empty, loading };
export default Table;
