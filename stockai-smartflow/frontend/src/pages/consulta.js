/**
 * pages/consulta.js — Asistente visual del repositor
 * El repositor escanea un producto → el sistema muestra stock, precio y ubicación en bodega.
 */
import AI       from '../api/ai.js';
import Products from '../api/products.js';
import Camera   from '../components/camera.js';

const Consulta = {
  async init(container) {
    container.innerHTML = _layout();
    const cameraZone = container.querySelector('#consulta-camera');
    if (cameraZone) {
      Camera.mount(cameraZone, (file) => _identify(file, container), {
        title: 'Escanear producto',
        sub:   'Apunta la cámara al frente del producto para ver su información',
      });
    }
    _bindManualSearch(container);
  },
};

async function _identify(file, container) {
  const cameraZone = container.querySelector('#consulta-camera');
  Camera.setLoading(cameraZone, true);
  _clearResult(container);

  try {
    const result = await AI.identify(file);
    Camera.setLoading(cameraZone, false);

    if (result.service_status === 'unavailable' || !result.detected) {
      window.Toast?.warning('No se pudo identificar el producto. Busca por nombre o SKU.');
      Camera.reset(cameraZone);
      return;
    }

    // Buscar el producto en BD por SKU o nombre
    const query = result.sku_guess ?? result.product_name ?? '';
    if (query) await _lookupProduct(query, container, result.confidence);
    else {
      window.Toast?.warning('IA no identificó el SKU. Busca manualmente.');
      Camera.reset(cameraZone);
    }
  } catch (err) {
    Camera.setLoading(cameraZone, false);
    window.Toast?.error(err.message ?? 'Error al identificar.');
    Camera.reset(cameraZone);
  }
}

async function _lookupProduct(query, container, confidence = null) {
  const resultEl = container.querySelector('#consulta-result');
  resultEl.innerHTML = `<div style="display:flex;justify-content:center;padding:24px"><div class="spinner"></div></div>`;

  try {
    const res      = await Products.list({ search: query, limit: 1 });
    const product  = res?.data?.[0];
    if (!product) {
      resultEl.innerHTML = `<div class="empty-state" style="padding:32px"><div class="icon">🔍</div><div class="title">Producto no encontrado</div><div class="desc">Intenta buscar por nombre o SKU</div></div>`;
      return;
    }
    _renderProductCard(product, resultEl, confidence);
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="title">Error: ${err.message}</div></div>`;
  }
}

function _renderProductCard(p, container, confidence) {
  const stock       = p.total_stock ?? 0;
  const stockColor  = stock <= 0 ? 'var(--accent-red)' : stock <= (p.threshold?.critical_stock ?? 0) ? 'var(--accent-amber)' : 'var(--accent-green)';
  const stockLabel  = stock <= 0 ? '🚨 Sin stock' : stock <= (p.threshold?.critical_stock ?? 0) ? '⚠️ Bajo' : '✅ Disponible';

  container.innerHTML = `
    <div class="content-card" style="border-color:var(--border-accent)">
      <div class="card-header" style="background:var(--accent-cyan-dim)">
        <div class="card-title">📦 Información del Producto</div>
        ${confidence != null ? `<span class="badge badge-cyan">IA ${confidence}%</span>` : ''}
      </div>
      <div class="card-body">
        <!-- Datos principales -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Producto</div>
            <div style="font-weight:700;font-size:18px">${p.name}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${p.sku}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Precio de Venta</div>
            <div style="font-weight:700;font-size:28px;color:var(--accent-cyan)">$${Number(p.price_sale).toLocaleString('es-CL')}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">STOCK</div>
            <div style="font-size:28px;font-weight:700;color:${stockColor}">${stock}</div>
            <div style="font-size:11px;color:${stockColor}">${stockLabel}</div>
          </div>
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">UBICACIÓN</div>
            <div class="loc-chip" style="font-size:22px;padding:4px 14px">${p.location}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px">en bodega</div>
          </div>
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px;text-align:center">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">ALGORITMO</div>
            <div style="font-size:16px;font-weight:700;color:var(--accent-purple)">${p.algorithm}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">rotación FEFO</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-ghost btn-sm" onclick="window.navigate('/fefo')">Ver cola FEFO →</button>
          <button class="btn btn-ghost btn-sm" onclick="window.navigate('/ingreso')">Ingresar stock →</button>
        </div>
      </div>
    </div>`;
}

function _bindManualSearch(container) {
  let timer;
  const input = container.querySelector('#consulta-search');
  const list  = container.querySelector('#consulta-search-results');

  input?.addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2) { if (list) list.style.display = 'none'; return; }
    timer = setTimeout(() => _searchAndShow(q, container), 350);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _lookupProduct(input.value.trim(), container);
  });
}

async function _searchAndShow(query, container) {
  const list = container.querySelector('#consulta-search-results');
  if (!list) return;
  try {
    const res = await Products.list({ search: query, limit: 5 });
    const products = res?.data ?? [];
    if (!products.length) { list.style.display = 'none'; return; }
    list.style.display = 'block';
    list.innerHTML = products.map(p => `
      <div class="profile-menu-item" data-id="${p.id}" style="cursor:pointer">
        <div>
          <div style="font-weight:600;font-size:13px">${p.name}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${p.sku} · Stock: ${p.total_stock ?? '—'}</div>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const p = products.find(x => x.id === el.dataset.id);
        if (p) { _renderProductCard(p, container.querySelector('#consulta-result'), null); list.style.display = 'none'; }
      });
    });
  } catch { /* silencioso */ }
}

function _clearResult(container) {
  const el = container.querySelector('#consulta-result');
  if (el) el.innerHTML = '';
}

function _layout() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Consulta Visual</div>
        <div class="page-desc">Escanea un producto para ver su stock, precio y ubicación en bodega</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">📷 Escanear con IA</div>
          <span class="badge badge-ia">Vision AI</span>
        </div>
        <div class="card-body">
          <div id="consulta-camera"></div>
        </div>
      </div>
      <div>
        <div class="content-card" style="margin-bottom:16px">
          <div class="card-body" style="padding:14px 20px">
            <div class="form-group" style="margin:0;position:relative">
              <label class="form-label">O busca por nombre / SKU</label>
              <div class="search-wrap">
                <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="consulta-search" class="search-input" placeholder="Nombre o SKU del producto…" autocomplete="off"/>
              </div>
              <div id="consulta-search-results" class="profile-dropdown" style="display:none;position:absolute;top:100%;z-index:100;width:100%;max-height:200px;overflow-y:auto"></div>
            </div>
          </div>
        </div>
        <div id="consulta-result"></div>
      </div>
    </div>`;
}

export default Consulta;
