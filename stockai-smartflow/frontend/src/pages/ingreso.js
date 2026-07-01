/**
 * pages/ingreso.js — Ingreso de productos con IA y modo manual
 *
 * Tab IA:     Camera → AI.identify → lookup en BD → pre-rellena formulario
 *             Si el producto no existe → muestra formulario de creación
 * Tab Manual: búsqueda de producto → formulario completo de lote
 * Historial:  muestra los últimos lotes ingresados en la sesión
 */
import Products from '../api/products.js';
import AI       from '../api/ai.js';
import Camera   from '../components/camera.js';
import Auth     from '../api/auth.js';

const _sessionBatches = [];
let   _allProducts    = [];   // caché de productos para el select

// Defaults de categoría → ubicación, vida útil y algoritmo sugeridos
const CATEGORY_DEFAULTS = {
  LACTEOS:    { location: 'A1-B1', vida_util: 14,   algorithm: '70_30' },
  BEBIDAS:    { location: 'B3-A1', vida_util: 90,   algorithm: '60_40' },
  PANADERIA:  { location: 'C3-A1', vida_util: 7,    algorithm: '70_30' },
  CONGELADOS: { location: 'E1-A1', vida_util: 180,  algorithm: '70_30' },
  ACEITES:    { location: 'D2-A1', vida_util: 730,  algorithm: '70_30' },
  SNACKS:     { location: 'F1-B1', vida_util: 120,  algorithm: '70_30' },
  LIMPIEZA:   { location: 'G1-A1', vida_util: 365,  algorithm: '70_30' },
};

const Ingreso = {
  async init(container) {
    container.innerHTML = _layout();
    _bindTabs(container);
    _bindManualSearch(container);
    _bindManualForm(container);
    _renderHistory(container);
    _loadAllProducts(container);   // carga catálogo para el select

    const cameraZone = container.querySelector('#camera-zone');
    if (cameraZone) {
      Camera.mount(cameraZone, (file) => _handleCapture(file, container));
    }
  },
};

// ── Flujo IA ──────────────────────────────────────────────────────────────────
async function _handleCapture(file, container) {
  const cameraZone = container.querySelector('#camera-zone');
  Camera.setLoading(cameraZone, true);

  try {
    const result = await AI.identify(file);
    Camera.setLoading(cameraZone, false);

    if (result.service_status === 'unavailable') {
      window.Toast?.warning('Motor IA no disponible. Completa el formulario manualmente.');
      _switchTab(container, 'manual');
      return;
    }

    // Buscar producto en BD por barcode o SKU detectado
    let existingProduct = null;
    const query = result.barcode || result.sku_guess;
    if (query) {
      try {
        const res = await Products.list({ search: query, limit: 5 });
        const products = res?.data ?? [];
        existingProduct = products.find(p =>
          (result.barcode && p.barcode === result.barcode) ||
          (result.sku_guess && p.sku === result.sku_guess)
        ) || (products.length === 1 ? products[0] : null);
      } catch { /* silencioso */ }
    }

    _showAIResult(result, existingProduct, container);

    if (existingProduct) {
      _selectProduct(existingProduct, container);
      _prefillBatchFields(result, container);
      const pct = Math.round((result.confidence ?? 0) * 100);
      if (result.auto_approved) {
        window.Toast?.success(`Producto identificado con ${pct}% de confianza.`);
      } else {
        window.Toast?.warning(`Confianza ${pct}% — revisa los datos antes de registrar.`);
      }
    } else {
      _showNewProductForm(result, container);
    }
  } catch (err) {
    Camera.setLoading(cameraZone, false);
    window.Toast?.error(err.message ?? 'Error al procesar la imagen.');
  }
}

function _showAIResult(result, existingProduct, container) {
  const resultEl = container.querySelector('#ai-result-box');
  if (!resultEl) return;

  const confidence = Math.round((result.confidence ?? 0) * 100);
  resultEl.className = 'ai-result show';

  if (existingProduct) {
    const isOk = result.auto_approved;
    resultEl.style.borderColor = isOk ? 'var(--border-accent)' : 'rgba(245,158,11,0.4)';
    resultEl.innerHTML = `
      <div class="ai-result-header">
        ${isOk ? '✅ Producto identificado' : '⚠️ Revisión manual requerida'}
        <span class="badge ${isOk ? 'badge-cyan' : 'badge-low'}" style="margin-left:8px">Confianza: ${confidence}%</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
        <div><span style="color:var(--text-muted)">Producto:</span> <strong>${existingProduct.name}</strong></div>
        <div><span style="color:var(--text-muted)">SKU:</span> <strong>${existingProduct.sku}</strong></div>
        <div><span style="color:var(--text-muted)">Vencimiento:</span> <strong>${result.expiry_date ?? '—'}</strong></div>
        <div><span style="color:var(--text-muted)">Lote:</span> <strong>${result.lot_number ?? '—'}</strong></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" id="btn-confirm-ai">
        📦 Registrar lote →
      </button>`;
    resultEl.querySelector('#btn-confirm-ai')?.addEventListener('click', () => _switchTab(container, 'manual'));
  } else {
    resultEl.style.borderColor = 'rgba(139,92,246,0.5)';
    resultEl.innerHTML = `
      <div class="ai-result-header">
        🔍 Producto no encontrado en el sistema
        ${confidence > 0 ? `<span class="badge badge-ia" style="margin-left:8px">IA ${confidence}%</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
        <div><span style="color:var(--text-muted)">Texto detectado:</span> <strong>${result.product_name ?? '—'}</strong></div>
        <div><span style="color:var(--text-muted)">Barcode:</span> <strong>${result.barcode ?? '—'}</strong></div>
        <div><span style="color:var(--text-muted)">Vencimiento:</span> <strong>${result.expiry_date ?? '—'}</strong></div>
        <div><span style="color:var(--text-muted)">Lote:</span> <strong>${result.lot_number ?? '—'}</strong></div>
      </div>`;
  }
}

function _prefillBatchFields(result, container) {
  _setVal(container, '#manual-lot',    result.lot_number  ?? '');
  _setVal(container, '#manual-expiry', result.expiry_date ?? '');
}

// ── Nuevo producto desde IA ───────────────────────────────────────────────────
async function _showNewProductForm(result, container) {
  const panel = container.querySelector('#new-product-panel');
  if (!panel) return;

  const user = Auth.currentUser();
  const canCreate = user?.role === 'ROLE_ADMIN' || user?.role === 'ROLE_MANAGER';

  if (!canCreate) {
    panel.innerHTML = `
      <div class="alert-card" style="margin-top:16px;padding:14px 16px">
        <div class="alert-icon">🔒</div>
        <div>
          <div style="font-weight:600;font-size:13px">Producto no registrado</div>
          <div style="font-size:12px;color:var(--text-muted)">
            Contacta a un Administrador o Jefe de Bodega para dar de alta este producto.
          </div>
        </div>
      </div>`;
    panel.style.display = 'block';
    return;
  }

  // Obtener SKU único del backend
  let suggestedSku = '';
  try {
    const skuRes = await Products.generateSku();
    suggestedSku = skuRes?.sku ?? '';
  } catch { /* usar vacío */ }

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="content-card" style="margin-top:16px;border:1px solid rgba(139,92,246,0.3)">
      <div class="card-header" style="background:rgba(139,92,246,0.08)">
        <div class="card-title" style="color:var(--accent-purple)">🆕 Crear nuevo producto</div>
        <span style="font-size:11px;color:var(--text-muted)">Completa los datos para darlo de alta</span>
      </div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Nombre del producto *</label>
            <input id="np-name" class="form-input" placeholder="Ej: Leche Entera 1L" value="${_escHtml(result.product_name ?? '')}" />
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">Categoría *</label>
            <select id="np-category" class="form-input">
              <option value="">— selecciona —</option>
              ${Object.keys(CATEGORY_DEFAULTS).map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">SKU (auto-generado)</label>
            <input id="np-sku" class="form-input" value="${_escHtml(suggestedSku)}" placeholder="SKU-######" style="font-family:var(--font-mono)" />
          </div>
          <div class="form-group">
            <label class="form-label">Barcode detectado</label>
            <input id="np-barcode" class="form-input" value="${_escHtml(result.barcode ?? '')}" placeholder="(vacío si no hay)" style="font-family:var(--font-mono)" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Vida útil promedio (días) *</label>
            <input id="np-vida-util" class="form-input" type="number" min="1" placeholder="14" />
          </div>
          <div class="form-group">
            <label class="form-label">Algoritmo FEFO</label>
            <select id="np-algorithm" class="form-input">
              <option value="70_30">70/30 — estándar</option>
              <option value="60_40">60/40 — alta rotación</option>
              <option value="80_20">80/20 — larga vida</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Ubicación sugerida *</label>
            <input id="np-location" class="form-input" placeholder="Ej: A1-B1" />
          </div>
          <div class="form-group">
            <label class="form-label">Unidad</label>
            <select id="np-unit" class="form-input">
              <option value="UNIT">Unidad</option>
              <option value="BOX">Caja</option>
              <option value="KG">Kg</option>
              <option value="LITER">Litro</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Precio costo</label>
            <input id="np-price-cost" class="form-input" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Precio venta *</label>
            <input id="np-price-sale" class="form-input" type="number" min="1" step="0.01" value="1" />
          </div>
        </div>
        <div id="np-error" style="display:none;color:var(--accent-red);font-size:12px;margin-bottom:8px"></div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost btn-sm" id="btn-np-cancel">Cancelar</button>
          <button class="btn btn-primary" id="btn-np-submit" style="flex:1;justify-content:center">
            <span id="np-submit-text">Crear Producto y Registrar Lote →</span>
            <span id="np-submit-spinner" class="spinner" style="display:none"></span>
          </button>
        </div>
      </div>
    </div>`;

  // Auto-rellenar defaults al cambiar categoría
  panel.querySelector('#np-category')?.addEventListener('change', (e) => {
    const defaults = CATEGORY_DEFAULTS[e.target.value];
    if (!defaults) return;
    _setVal(panel, '#np-vida-util', defaults.vida_util);
    _setVal(panel, '#np-location',  defaults.location);
    panel.querySelector('#np-algorithm').value = defaults.algorithm;
  });

  panel.querySelector('#btn-np-cancel')?.addEventListener('click', () => {
    panel.style.display = 'none';
    panel.innerHTML = '';
    const cameraZone = container.querySelector('#camera-zone');
    if (cameraZone) Camera.reset(cameraZone);
    container.querySelector('#ai-result-box').className = 'ai-result';
  });

  panel.querySelector('#btn-np-submit')?.addEventListener('click', () =>
    _submitNewProduct(result, container)
  );

  panel.querySelector('#np-name')?.focus();
}

async function _submitNewProduct(aiResult, container) {
  const panel = container.querySelector('#new-product-panel');
  const setErr = (msg) => {
    const el = panel?.querySelector('#np-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  };

  const name      = panel?.querySelector('#np-name')?.value?.trim();
  const category  = panel?.querySelector('#np-category')?.value;
  const sku       = panel?.querySelector('#np-sku')?.value?.trim();
  const barcode   = panel?.querySelector('#np-barcode')?.value?.trim() || null;
  const vidaUtil  = parseInt(panel?.querySelector('#np-vida-util')?.value);
  const algorithm = panel?.querySelector('#np-algorithm')?.value;
  const location  = panel?.querySelector('#np-location')?.value?.trim();
  const unit      = panel?.querySelector('#np-unit')?.value;
  const priceCost = parseFloat(panel?.querySelector('#np-price-cost')?.value) || 0;
  const priceSale = parseFloat(panel?.querySelector('#np-price-sale')?.value);

  if (!name)     return setErr('El nombre del producto es obligatorio.');
  if (!category) return setErr('Selecciona una categoría.');
  if (!location) return setErr('La ubicación en bodega es obligatoria.');
  if (!vidaUtil || vidaUtil < 1) return setErr('La vida útil debe ser al menos 1 día.');
  if (!priceSale || priceSale < 1) return setErr('El precio de venta debe ser al menos 1.');
  setErr('');

  const btn     = panel?.querySelector('#btn-np-submit');
  const textEl  = panel?.querySelector('#np-submit-text');
  const spinner = panel?.querySelector('#np-submit-spinner');
  if (btn) btn.disabled = true;
  if (textEl)  textEl.style.display  = 'none';
  if (spinner) spinner.style.display = 'inline-block';

  try {
    const product = await Products.create({
      name, category, sku: sku || undefined, barcode,
      vida_util_promedio_dias: vidaUtil,
      algorithm, location, unit,
      price_cost: priceCost,
      price_sale: priceSale,
    });

    window.Toast?.success(`Producto "${product.name}" creado con SKU ${product.sku}`);

    // Ocultar panel y pre-rellenar formulario manual
    panel.style.display = 'none';
    panel.innerHTML = '';
    _selectProduct(product, container);
    _prefillBatchFields(aiResult, container);
    _switchTab(container, 'manual');
  } catch (err) {
    setErr(err.message ?? 'Error al crear el producto.');
  } finally {
    if (btn) btn.disabled = false;
    if (textEl)  textEl.style.display  = 'inline';
    if (spinner) spinner.style.display = 'none';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Carga catálogo completo y renderiza el listbox ────────────────────────────
async function _loadAllProducts(container) {
  try {
    const res = await Products.list({ limit: 500, sort: 'name' });
    _allProducts = res?.data ?? [];
    _renderProductList(container, '');
  } catch {
    const box = container.querySelector('#product-list-box');
    if (box) box.innerHTML = `<div style="padding:16px;text-align:center;color:#6b7280;font-size:13px">Error al cargar productos</div>`;
  }
}

function _renderProductList(container, query) {
  const box = container.querySelector('#product-list-box');
  if (!box) return;

  const q        = query.toLowerCase().trim();
  const filtered = q
    ? _allProducts.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      )
    : _allProducts;

  if (!filtered.length) {
    box.innerHTML = q
      ? `<div style="padding:16px;text-align:center;color:#6b7280;font-size:13px">Sin resultados para "<strong style="color:#e5e7eb">${_escHtml(query)}</strong>"</div>`
      : `<div style="padding:16px;text-align:center;color:#6b7280;font-size:13px">Sin productos en el inventario</div>`;
    return;
  }

  box.innerHTML = filtered.map(p => `
    <div data-id="${p.id}"
         style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05)">
      <div style="font-size:13px;font-weight:600;color:#e5e7eb">${_highlight(p.name, q)}</div>
      <div style="font-size:11px;color:#6b7280;font-family:monospace;margin-top:2px">
        ${_escHtml(p.sku)} · Stock: ${p.total_stock ?? '—'} uds
      </div>
    </div>`).join('');

  box.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,.07)');
    el.addEventListener('mouseleave', () => el.style.background = '');
    el.addEventListener('click', () => {
      const product = _allProducts.find(p => p.id === el.dataset.id);
      if (product) _selectProduct(product, container);
    });
  });
}

// ── Búsqueda de producto en modo manual ───────────────────────────────────────
function _bindManualSearch(container) {
  const input = container.querySelector('#manual-product-search');
  if (!input) return;

  input.addEventListener('input', (e) => {
    _renderProductList(container, e.target.value);
    // Limpiar selección previa al volver a escribir
    container.querySelector('#manual-form')?.removeAttribute('data-product-id');
    container.querySelector('#selected-product-info').innerHTML = '';
    const locInput = container.querySelector('#manual-location');
    if (locInput) locInput.value = '';
  });
}

/** Resalta la parte que coincide con la búsqueda */
function _highlight(text, query) {
  const safe  = _escHtml(text);
  const safeQ = _escHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${safeQ})`, 'gi'), '<mark style="background:rgba(6,182,212,.25);border-radius:2px;padding:0 1px">$1</mark>');
}

function _selectProduct(product, container) {
  _setVal(container, '#manual-product-search', product.name);
  container.querySelector('#manual-form')?.setAttribute('data-product-id', product.id);

  // Auto-rellenar ubicación con la del producto si el campo está vacío
  const locInput = container.querySelector('#manual-location');
  if (locInput && !locInput.value.trim()) {
    locInput.value = product.location || '';
  }

  // Tarjeta del producto seleccionado con botón para cambiar
  container.querySelector('#selected-product-info').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
                background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.25);
                border-radius:8px;padding:10px 14px;margin-top:8px;gap:12px">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <span style="font-size:20px">📦</span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(product.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">
            ${product.sku} &middot; Vida útil: ${product.vida_util_promedio_dias}d &middot; ${product.algorithm} &middot; 📍 ${product.location}
          </div>
        </div>
      </div>
      <button id="btn-clear-product" style="flex-shrink:0;background:none;border:none;cursor:pointer;
              color:var(--text-muted);font-size:16px;padding:4px 6px;border-radius:4px"
              title="Cambiar producto">✕</button>
    </div>`;

  container.querySelector('#btn-clear-product')?.addEventListener('click', () => {
    _clearProductSelection(container);
  });
}

function _clearProductSelection(container) {
  _setVal(container, '#manual-product-search', '');
  container.querySelector('#manual-form')?.removeAttribute('data-product-id');
  container.querySelector('#selected-product-info').innerHTML = '';
  const locInput = container.querySelector('#manual-location');
  if (locInput) locInput.value = '';
  _renderProductList(container, '');
  container.querySelector('#manual-product-search')?.focus();
}

// ── Submit del formulario manual ──────────────────────────────────────────────
function _bindManualForm(container) {
  container.querySelector('#btn-submit-batch')?.addEventListener('click', () => _submitBatch(container));
  container.querySelector('#manual-form')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') _submitBatch(container);
  });
}

async function _submitBatch(container) {
  const form      = container.querySelector('#manual-form');
  const productId = form?.getAttribute('data-product-id');

  if (!productId) { window.Toast?.warning('Selecciona un producto primero.'); return; }

  const lotInput = container.querySelector('#manual-lot')?.value?.trim();
  const lot      = lotInput || _autoLot();   // auto-generar si está vacío
  const qty      = container.querySelector('#manual-qty')?.value;
  const expiry   = container.querySelector('#manual-expiry')?.value;
  const mfg      = container.querySelector('#manual-mfg')?.value;
  const location = container.querySelector('#manual-location')?.value?.trim();
  const notes    = container.querySelector('#manual-notes')?.value?.trim();

  if (!qty || !expiry) {
    window.Toast?.warning('Cantidad y fecha de vencimiento son obligatorios.');
    return;
  }
  if (new Date(expiry) <= new Date()) {
    window.Toast?.warning('La fecha de vencimiento debe ser futura.');
    return;
  }

  const btn = container.querySelector('#btn-submit-batch');
  btn.disabled = true;
  btn.textContent = 'Registrando…';

  try {
    const batch = await Products.createBatch(productId, {
      lot_number:       lot,
      quantity:         +qty,
      expiry_date:      expiry,
      manufacture_date: mfg || null,
      location_bodega:  location || null,
      notes:            notes || null,
    });

    window.Toast?.success('✅ Lote registrado correctamente. FEFO actualizado.');
    _sessionBatches.unshift({ ...batch, _registeredAt: new Date().toLocaleTimeString('es-CL') });
    _renderHistory(container);
    _resetForm(container);
  } catch (err) {
    window.Toast?.error(err.message ?? 'Error al registrar el lote.');
  } finally {
    btn.disabled = false;
    btn.textContent = '📦 Registrar Lote';
  }
}

function _renderHistory(container) {
  const el = container.querySelector('#batch-history');
  if (!el) return;

  if (!_sessionBatches.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px"><div class="icon">📋</div><div class="title">Sin ingresos en esta sesión</div></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Hora</th><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Vence</th></tr></thead>
      <tbody>
        ${_sessionBatches.slice(0, 8).map(b => `
          <tr>
            <td class="col-mono" style="font-size:11px">${b._registeredAt ?? '—'}</td>
            <td>${b.product?.name ?? '—'}</td>
            <td class="col-mono">${b.lot_number}</td>
            <td class="col-mono">${b.quantity}</td>
            <td class="col-mono">${b.expiry_date ?? '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/** Genera un número de lote automático con fecha + 4 chars aleatorios */
function _autoLot() {
  const d   = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `L${ymd}-${rnd}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _switchTab(container, tabId) {
  container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  container.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
}

function _bindTabs(container) {
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(container, btn.dataset.tab));
  });
}

function _setVal(container, selector, value) {
  const el = container.querySelector(selector);
  if (el) el.value = value;
}

function _resetForm(container) {
  container.querySelector('#manual-form')?.removeAttribute('data-product-id');
  ['#manual-product-search','#manual-lot','#manual-qty','#manual-expiry',
   '#manual-mfg','#manual-location','#manual-notes']
    .forEach(s => _setVal(container, s, ''));
  container.querySelector('#selected-product-info').innerHTML = '';
  _renderProductList(container, '');
  const cameraZone = container.querySelector('#camera-zone');
  if (cameraZone) Camera.reset(cameraZone);
  container.querySelector('#ai-result-box').className = 'ai-result';
  const npPanel = container.querySelector('#new-product-panel');
  if (npPanel) { npPanel.style.display = 'none'; npPanel.innerHTML = ''; }
}

// ── Layout ────────────────────────────────────────────────────────────────────
function _layout() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Ingreso de Productos</div>
        <div class="page-desc">Registra nuevos lotes con identificación IA o de forma manual</div>
      </div>
    </div>

    <div class="grid-2-1">
      <!-- Panel principal: tabs IA / Manual -->
      <div class="content-card">
        <div class="card-header">
          <div class="tabs" style="margin:0">
            <button class="tab-btn active" data-tab="ia">🤖 Modo IA</button>
            <button class="tab-btn" data-tab="manual">✏️ Manual</button>
          </div>
          <span class="badge badge-ia">Confianza &gt; 85%</span>
        </div>
        <div class="card-body">
          <!-- TAB IA -->
          <div class="tab-content active" id="tab-ia">
            <div id="camera-zone"></div>
            <div class="ai-result" id="ai-result-box"></div>
            <div id="new-product-panel" style="display:none"></div>
          </div>

          <!-- TAB MANUAL -->
          <div class="tab-content" id="tab-manual">

            <!-- 1. Selector de producto con filtro por texto -->
            <div class="form-group" style="margin-bottom:4px">
              <label class="form-label">Producto *</label>
              <div class="search-wrap" style="margin-bottom:6px">
                <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="manual-product-search" class="search-input"
                       placeholder="Escribir para filtrar productos del inventario…"
                       autocomplete="off"/>
              </div>
              <!-- Listbox siempre visible, espacio fijo, sin dependencias CSS -->
              <div id="product-list-box"
                   style="width:100%;min-height:160px;max-height:220px;
                          overflow-y:auto;overflow-x:hidden;
                          background:#1a1f2e;
                          border:1px solid rgba(255,255,255,.12);
                          border-radius:8px;
                          margin-bottom:8px">
                <div style="padding:16px;text-align:center;color:#6b7280;font-size:13px">
                  Cargando productos…
                </div>
              </div>
              <div id="selected-product-info"></div>
            </div>

            <!-- 2. Campos del lote (campos principales) -->
            <div id="manual-form" style="margin-top:14px">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Cantidad (uds) *</label>
                  <input id="manual-qty" class="form-input" type="number" min="1" placeholder="Ej: 48" />
                </div>
                <div class="form-group">
                  <label class="form-label">Fecha de Vencimiento *</label>
                  <input id="manual-expiry" class="form-input" type="date" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ubicación en Bodega
                  <span style="font-weight:400;color:var(--text-muted);font-size:11px"> — se auto-completa al seleccionar el producto</span>
                </label>
                <input id="manual-location" class="form-input" placeholder="Ej: A3-B2" />
              </div>

              <!-- Opciones adicionales colapsadas -->
              <details style="margin-bottom:14px">
                <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);
                                padding:6px 0;user-select:none;list-style:none;
                                display:flex;align-items:center;gap:6px">
                  <span style="font-size:10px">▶</span> Opciones adicionales (N° de lote, fecha fabricación, notas)
                </summary>
                <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">N° de Lote
                        <span style="font-weight:400;color:var(--text-muted);font-size:11px"> — auto-generado si se deja vacío</span>
                      </label>
                      <input id="manual-lot" class="form-input" placeholder="Ej: L20240612-AB3F" style="font-family:var(--font-mono)" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Fecha de Fabricación</label>
                      <input id="manual-mfg" class="form-input" type="date" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Notas / Observaciones</label>
                    <textarea id="manual-notes" class="form-textarea" rows="2"
                              placeholder="Ingreso por traslado, condición del embalaje…"></textarea>
                  </div>
                </div>
              </details>

              <button class="btn btn-primary" id="btn-submit-batch"
                      style="width:100%;justify-content:center;padding:13px;font-size:14px">
                📦 Registrar Lote
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel lateral: historial de la sesión -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">📋 Historial de la sesión</div>
        </div>
        <div id="batch-history" style="max-height:500px;overflow-y:auto"></div>
      </div>
    </div>`;
}

export default Ingreso;
