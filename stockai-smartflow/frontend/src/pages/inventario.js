/**
 * pages/inventario.js — Inventario completo StockAI
 * Filtros: categoría, estado stock, algoritmo, búsqueda, ordenamiento.
 * Acciones: editar precio inline, ver lotes, actualizar Stock_Crítico.
 */
import Products from '../api/products.js';
import Table    from '../components/table.js';

const CATEGORIES  = ['LACTEOS','BEBIDAS','PANADERIA','CONGELADOS','ACEITES','SNACKS','LIMPIEZA'];
const ALGORITHMS  = ['70_30', '60_40'];

let _state = { page: 1, search: '', category: '', status: '', algorithm: '', sort: 'name', order: 'ASC' };
let _searchTimer = null;
let _container   = null;

const Inventario = {
  async init(container) {
    _container = container;
    _state = { page: 1, search: '', category: '', status: '', algorithm: '', sort: 'name', order: 'ASC' };
    container.innerHTML = _layout();
    _bindFilters(container);
    await _load();
  },
};

// ── Carga con los filtros actuales ────────────────────────────────────────────
async function _load() {
  const tableEl = document.getElementById('inv-table');
  if (!tableEl) return;
  Table.loading(tableEl);

  try {
    const res = await Products.list({ ..._state, limit: 25 });
    const data = res?.data ?? [];
    const meta = res?.meta ?? {};

    Table.products(tableEl, data, {
      onPrice: (id) => _editPrice(id, data),
      onEdit:  (id) => window.navigate('/fefo?product=' + id),
    });

    _renderPagination(meta);
    document.getElementById('inv-count').textContent =
      `${meta.total ?? data.length} producto${(meta.total ?? data.length) !== 1 ? 's' : ''}`;
  } catch (err) {
    Table.empty(tableEl, '❌', 'Error al cargar inventario', err.message);
    window.Toast?.error('Error cargando inventario.');
  }
}

// ── Paginación ────────────────────────────────────────────────────────────────
function _renderPagination(meta) {
  const el = document.getElementById('inv-pagination');
  if (!el || !meta.pages) return;

  const { page, pages } = meta;
  const prev = page > 1 ? `<button class="page-btn" id="pg-prev">‹</button>` : '';
  const next = page < pages ? `<button class="page-btn" id="pg-next">›</button>` : '';
  const info = `<span style="font-size:12px;color:var(--text-muted)">Pág. ${page} / ${pages}</span>`;

  el.innerHTML = prev + info + next;
  document.getElementById('pg-prev')?.addEventListener('click', () => { _state.page--; _load(); });
  document.getElementById('pg-next')?.addEventListener('click', () => { _state.page++; _load(); });
}

// ── Edición de precio inline ──────────────────────────────────────────────────
async function _editPrice(productId, data) {
  const product = data.find(p => p.id === productId);
  if (!product) return;

  const newPrice = prompt(`Nuevo precio de venta para "${product.name}" (actual: $${product.price_sale})`);
  if (!newPrice || isNaN(newPrice) || +newPrice < 1) return;

  try {
    await Products.updatePrice(productId, +newPrice);
    window.Toast?.success('Precio actualizado correctamente.');
    _load();
  } catch (err) {
    window.Toast?.error(err.message ?? 'Error al actualizar precio.');
  }
}

// ── Bind de filtros ───────────────────────────────────────────────────────────
function _bindFilters(container) {
  // Búsqueda con debounce
  container.querySelector('#inv-search')?.addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _state.search = e.target.value.trim();
      _state.page = 1;
      _load();
    }, 350);
  });

  // Filter chips
  container.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const { filter, value } = chip.dataset;
      const isActive = chip.classList.contains('active');

      // Desactivar chips del mismo grupo
      container.querySelectorAll(`.filter-chip[data-filter="${filter}"]`).forEach(c => c.classList.remove('active'));

      if (isActive) {
        _state[filter] = '';
      } else {
        chip.classList.add('active');
        _state[filter] = value;
      }
      _state.page = 1;
      _load();
    });
  });

  // Ordenamiento
  container.querySelector('#inv-sort')?.addEventListener('change', (e) => {
    const [sort, order] = e.target.value.split(':');
    _state.sort = sort;
    _state.order = order;
    _state.page = 1;
    _load();
  });

  // Exportar CSV
  container.querySelector('#btn-export')?.addEventListener('click', () => _exportCSV());

  // Nuevo producto
  container.querySelector('#btn-new-product')?.addEventListener('click', () => window.navigate('/ingreso'));
}

// ── Exportar CSV simple ───────────────────────────────────────────────────────
async function _exportCSV() {
  window.Toast?.info('Generando exportación…');
  try {
    const res  = await Products.list({ ..._state, limit: 100, page: 1 });
    const data = res?.data ?? [];
    if (!data.length) { window.Toast?.warning('Sin datos para exportar.'); return; }

    const cols = ['SKU','Nombre','Categoría','Stock','Stock Mín.','Precio Costo','Precio Venta','Ubicación','Algoritmo'];
    const rows = data.map(p => [
      p.sku, p.name, p.category,
      p.total_stock ?? 0, p.threshold?.critical_stock ?? 0,
      p.price_cost, p.price_sale, p.location, p.algorithm,
    ]);

    const csv  = [cols, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `inventario-stockai-${Date.now()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    window.Toast?.success('CSV descargado.');
  } catch (err) {
    window.Toast?.error('Error al exportar.');
  }
}

// ── Layout ────────────────────────────────────────────────────────────────────
function _layout() {
  const catChips = CATEGORIES.map(c =>
    `<button class="filter-chip" data-filter="category" data-value="${c}">${c}</button>`
  ).join('');

  const statusChips = [
    ['CRITICAL','🚨 Crítico'], ['LOW','⚠️ Bajo'], ['NORMAL','✅ Normal']
  ].map(([v, l]) => `<button class="filter-chip" data-filter="status" data-value="${v}">${l}</button>`).join('');

  const algoChips = ALGORITHMS.map(a =>
    `<button class="filter-chip" data-filter="algorithm" data-value="${a}">${a.replace('_','/')}</button>`
  ).join('');

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Inventario Completo</div>
        <div class="page-desc" id="inv-count">Cargando…</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost btn-sm" id="btn-export">⬇ Exportar CSV</button>
        <button class="btn btn-primary" id="btn-new-product">＋ Nuevo producto</button>
      </div>
    </div>

    <!-- Barra de búsqueda -->
    <div class="content-card" style="margin-bottom:16px">
      <div class="card-body" style="padding:16px">
        <div class="search-wrap" style="margin-bottom:14px">
          <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="inv-search" class="search-input" placeholder="Buscar por nombre, SKU o código de barras…" />
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Categoría:</span>
          <div class="filter-bar" style="margin:0">${catChips}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Estado:</span>
          <div class="filter-bar" style="margin:0">${statusChips}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Algoritmo:</span>
            <div class="filter-bar" style="margin:0">${algoChips}</div>
          </div>
          <select id="inv-sort" class="form-select" style="width:auto;padding:6px 12px;font-size:12px">
            <option value="name:ASC">Nombre A→Z</option>
            <option value="name:DESC">Nombre Z→A</option>
            <option value="price_sale:ASC">Precio ↑</option>
            <option value="price_sale:DESC">Precio ↓</option>
            <option value="created_at:DESC">Más recientes</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Tabla -->
    <div class="content-card">
      <div id="inv-table"></div>
      <div class="table-footer">
        <span class="table-total"></span>
        <div class="table-pages" id="inv-pagination"></div>
      </div>
    </div>`;
}

export default Inventario;
