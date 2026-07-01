/**
 * ARCHIVO COMBINADO — 4 páginas restantes
 * Separar en archivos individuales al copiar al proyecto.
 * ─────────────────────────────────────────────────────
 *  sugerencias.js    → pages/sugerencias.js
 *  perfil.js         → pages/perfil.js
 *  configuracion.js  → pages/configuracion.js
 *  seguridad.js      → pages/seguridad.js
 */

/* ════════════════════════════════════════════════════
   pages/sugerencias.js — Sugerencias de reposición
════════════════════════════════════════════════════ */
// import Batches  from '../api/batches.js';
// import Products from '../api/products.js';

export const Sugerencias = {
  async init(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Sugerencias de Reposición</div>
          <div class="page-desc">Rutas optimizadas para el repositor basadas en la cola FEFO activa</div>
        </div>
        <button class="btn btn-primary" onclick="window.navigate('/fefo')">Ver FEFO →</button>
      </div>
      <div class="alert-card info" style="margin-bottom:20px">
        <div class="alert-icon">💡</div>
        <div>
          <div class="alert-title">Cómo funciona</div>
          <div class="alert-desc">El sistema agrupa los lotes P1 (más urgentes) por zona de ubicación en bodega para que el repositor haga el menor número de viajes posible.</div>
        </div>
      </div>
      <div id="sug-content"><div style="display:flex;justify-content:center;padding:36px"><div class="spinner"></div></div></div>`;
    await _loadSugerencias(container);
  },
};

async function _loadSugerencias(container) {
  const el = container.querySelector('#sug-content');
  try {
    // Importación dinámica para evitar error de módulo en el archivo combinado
    const { default: Batches } = await import('../api/batches.js');
    const res     = await Batches.getExpiring({ days: 14, limit: 100 });
    const batches = res?.data ?? [];
    const p1      = batches.filter(b => b.fefo_priority === 'P1' || b.algorithm_alert);

    if (!p1.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">✅</div><div class="title">Sin reposiciones urgentes</div><div class="desc">No hay lotes P1 activos en los próximos 14 días.</div></div>`;
      return;
    }

    // Agrupar por pasillo (primer char de location_bodega, ej: "A3-B2" → pasillo A)
    const byZone = p1.reduce((acc, b) => {
      const zone = (b.location_bodega ?? b.product?.location ?? 'Z')[0];
      if (!acc[zone]) acc[zone] = [];
      acc[zone].push(b);
      return acc;
    }, {});

    el.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">🗺️ Ruta sugerida — ${p1.length} lotes en ${Object.keys(byZone).length} zonas</div>
          <span class="badge badge-p1">⏰ Solo P1 urgentes</span>
        </div>
        <div class="card-body">
          ${Object.entries(byZone).sort().map(([zone, items], idx) => `
            <div style="margin-bottom:20px">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">
                Parada ${idx + 1} — Pasillo ${zone} (${items.length} lote${items.length !== 1 ? 's' : ''})
              </div>
              ${items.map(b => `
                <div class="fefo-card">
                  <div class="fefo-prio p1">P1</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:13px">${b.product?.name ?? '—'}</div>
                    <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">
                      Lote: ${b.lot_number} · ${b.quantity} uds · Vence: ${b.expiry_date ?? '—'}
                    </div>
                  </div>
                  <span class="loc-chip">${b.location_bodega ?? b.product?.location ?? '—'}</span>
                </div>`).join('')}
            </div>`).join('')}
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="title">Error: ${err.message}</div></div>`;
  }
}

/* ════════════════════════════════════════════════════
   pages/perfil.js — Perfil del usuario
════════════════════════════════════════════════════ */
export const Perfil = {
  async init(container) {
    const { default: Auth } = await import('../api/auth.js');
    const user = Auth.currentUser() ?? {};
    const initials = (user.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const roleLabel = { ROLE_ADMIN: 'Administrador', ROLE_MANAGER: 'Jefe de Bodega', ROLE_OPERATOR: 'Repositor' }[user.role] ?? user.role ?? '—';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Mi Perfil</div>
      </div>

      <div class="profile-banner" style="margin-bottom:20px">
        <div class="profile-avatar-xl">${initials}</div>
        <div>
          <div class="profile-info-name">${user.name ?? '—'}</div>
          <div class="profile-info-role">${roleLabel} · <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${user.email ?? ''}</span></div>
          <div style="margin-top:8px"><span class="badge badge-cyan">Sesión activa</span></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="content-card">
          <div class="card-header"><div class="card-title">Datos personales</div></div>
          <div class="card-body">
            ${_fieldRow('Nombre completo',  user.name ?? '—')}
            ${_fieldRow('Email',            user.email ?? '—')}
            ${_fieldRow('Rol asignado',     roleLabel)}
            ${_fieldRow('MFA',              user.mfa_enabled ? '✅ Activado' : '⚠️ Desactivado')}
            ${_fieldRow('Último acceso',    user.last_login ? new Date(user.last_login).toLocaleString('es-CL') : 'Primera sesión')}
          </div>
          <div style="padding:0 20px 16px">
            <button class="btn btn-ghost btn-sm" onclick="window.navigate('/seguridad')">
              🔒 Cambiar contraseña y MFA →
            </button>
          </div>
        </div>
        <div class="content-card">
          <div class="card-header"><div class="card-title">Acceso y permisos</div></div>
          <div class="card-body">
            ${_permRow('Ver inventario',           true)}
            ${_permRow('Registrar lotes (ingreso)', user.role !== 'ROLE_OPERATOR')}
            ${_permRow('Editar precios',            user.role !== 'ROLE_OPERATOR')}
            ${_permRow('Resolver alertas',          user.role !== 'ROLE_OPERATOR')}
            ${_permRow('Gestionar usuarios',        user.role === 'ROLE_ADMIN')}
            ${_permRow('Ver audit log',             user.role === 'ROLE_ADMIN')}
          </div>
        </div>
      </div>`;
  },
};

function _fieldRow(label, value) {
  return `
    <div class="settings-row" style="margin-bottom:6px">
      <div><div class="settings-row-title">${label}</div></div>
      <div style="font-size:13px;color:var(--text-secondary);font-family:${label === 'Email' ? 'var(--font-mono)' : 'inherit'}">${value}</div>
    </div>`;
}

function _permRow(label, allowed) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;color:var(--text-secondary)">${label}</span>
      <span style="font-size:12px;font-weight:600;color:${allowed ? 'var(--accent-green)' : 'var(--text-muted)'}">
        ${allowed ? '✅ Permitido' : '— Sin acceso'}
      </span>
    </div>`;
}

/* ════════════════════════════════════════════════════
   pages/configuracion.js — Ajustes del sistema
════════════════════════════════════════════════════ */
const CONFIG_KEYS = {
  algorithm:     'sai_cfg_algorithm',
  notifications: 'sai_cfg_notifications',
  aiEnabled:     'sai_cfg_ai_enabled',
  aiThreshold:   'sai_cfg_ai_threshold',
  language:      'sai_cfg_language',
};

const _getCfg = (key, def) => { try { const v = localStorage.getItem(CONFIG_KEYS[key]); return v !== null ? JSON.parse(v) : def; } catch { return def; } };
const _setCfg = (key, val)  => localStorage.setItem(CONFIG_KEYS[key], JSON.stringify(val));

export const Configuracion = {
  init(container) {
    const cfg = {
      algorithm:     _getCfg('algorithm',     '70_30'),
      notifications: _getCfg('notifications', true),
      aiEnabled:     _getCfg('aiEnabled',     true),
      aiThreshold:   _getCfg('aiThreshold',   85),
    };

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Configuración</div>
        <div class="page-desc">Ajustes del sistema y preferencias</div>
      </div>

      <div class="content-card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">Algoritmo FEFO por defecto</div></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Algoritmo de rotación predeterminado</label>
            <select id="cfg-algorithm" class="form-select" style="max-width:300px">
              <option value="70_30" ${cfg.algorithm === '70_30' ? 'selected' : ''}>70/30 — Alerta al 70% de vida útil</option>
              <option value="60_40" ${cfg.algorithm === '60_40' ? 'selected' : ''}>60/40 — Alerta al 60% de vida útil (lácteos)</option>
            </select>
            <div class="form-error" style="color:var(--text-muted);margin-top:6px">Se aplica al crear nuevos productos sin algoritmo específico.</div>
          </div>
        </div>
      </div>

      <div class="content-card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">Motor de IA</div></div>
        <div class="card-body">
          <div class="settings-row" style="margin-bottom:10px">
            <div>
              <div class="settings-row-title">Identificación automática por cámara</div>
              <div class="settings-row-desc">Si se desactiva, el ingreso siempre usará el formulario manual.</div>
            </div>
            <label class="toggle-wrap">
              <div class="toggle ${cfg.aiEnabled ? 'on' : ''}" id="cfg-ai-toggle"></div>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">Umbral de confianza mínimo (%)</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input id="cfg-ai-threshold" type="range" min="60" max="99" value="${cfg.aiThreshold}" style="flex:1"/>
              <span id="cfg-ai-threshold-val" style="font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan);min-width:40px">${cfg.aiThreshold}%</span>
            </div>
            <div class="form-error" style="color:var(--text-muted);margin-top:4px">Por debajo de este umbral → revisión manual obligatoria.</div>
          </div>
        </div>
      </div>

      <div class="content-card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">Notificaciones</div></div>
        <div class="card-body">
          <div class="settings-row">
            <div>
              <div class="settings-row-title">Alertas de vencimiento</div>
              <div class="settings-row-desc">Mostrar toast cuando el job detecte lotes con fecha_alerta vencida.</div>
            </div>
            <label class="toggle-wrap">
              <div class="toggle ${cfg.notifications ? 'on' : ''}" id="cfg-notif-toggle"></div>
            </label>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="btn-save-cfg">💾 Guardar cambios</button>
        <button class="btn btn-ghost" id="btn-reset-cfg">Restablecer valores</button>
      </div>`;

    // Bind
    const thresholdEl = container.querySelector('#cfg-ai-threshold');
    const thresholdVal = container.querySelector('#cfg-ai-threshold-val');
    thresholdEl?.addEventListener('input', () => { if (thresholdVal) thresholdVal.textContent = `${thresholdEl.value}%`; });

    _bindToggle(container, 'cfg-ai-toggle',    cfg.aiEnabled);
    _bindToggle(container, 'cfg-notif-toggle', cfg.notifications);

    container.querySelector('#btn-save-cfg')?.addEventListener('click', () => {
      _setCfg('algorithm',     container.querySelector('#cfg-algorithm')?.value ?? '70_30');
      _setCfg('aiEnabled',     container.querySelector('#cfg-ai-toggle')?.classList.contains('on'));
      _setCfg('aiThreshold',   +(container.querySelector('#cfg-ai-threshold')?.value ?? 85));
      _setCfg('notifications', container.querySelector('#cfg-notif-toggle')?.classList.contains('on'));
      window.Toast?.success('Configuración guardada.');
    });

    container.querySelector('#btn-reset-cfg')?.addEventListener('click', () => {
      Object.values(CONFIG_KEYS).forEach(k => localStorage.removeItem(k));
      window.Toast?.info('Configuración restablecida. Recarga la página.');
    });
  },
};

function _bindToggle(container, id, initial) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  if (initial) el.classList.add('on');
  el.addEventListener('click', () => el.classList.toggle('on'));
}

/* ════════════════════════════════════════════════════
   pages/seguridad.js — Seguridad y Audit Log (Admin)
════════════════════════════════════════════════════ */
export const Seguridad = {
  async init(container) {
    const { default: Auth } = await import('../api/auth.js');
    const user = Auth.currentUser() ?? {};
    const isAdmin = user.role === 'ROLE_ADMIN';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Seguridad</div>
        <div class="page-desc">Contraseña, MFA y registro de auditoría</div>
      </div>

      <div class="grid-2" style="margin-bottom:16px">
        <!-- Cambiar contraseña -->
        <div class="content-card">
          <div class="card-header"><div class="card-title">🔑 Cambiar contraseña</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Contraseña actual</label>
              <input id="sec-pwd-current" type="password" class="form-input" placeholder="••••••••"/>
            </div>
            <div class="form-group">
              <label class="form-label">Nueva contraseña</label>
              <input id="sec-pwd-new" type="password" class="form-input" placeholder="Mín. 8 chars, mayúsculas y números"/>
            </div>
            <div class="form-group">
              <label class="form-label">Confirmar nueva contraseña</label>
              <input id="sec-pwd-confirm" type="password" class="form-input" placeholder="••••••••"/>
            </div>
            <button class="btn btn-primary" id="btn-change-pwd" style="width:100%;justify-content:center">Cambiar contraseña</button>
          </div>
        </div>

        <!-- MFA y sesión -->
        <div>
          <div class="content-card" style="margin-bottom:14px">
            <div class="card-header"><div class="card-title">🛡️ Autenticación de dos factores (MFA)</div></div>
            <div class="card-body">
              <div class="alert-card ${user.mfa_enabled ? 'success' : 'warning'}" style="margin-bottom:14px">
                <div class="alert-icon">${user.mfa_enabled ? '✅' : '⚠️'}</div>
                <div>
                  <div class="alert-title">MFA ${user.mfa_enabled ? 'activado' : 'desactivado'}</div>
                  <div class="alert-desc">${user.mfa_enabled ? 'Tu cuenta está protegida con TOTP.' : 'Se recomienda activar MFA para mayor seguridad.'}</div>
                </div>
              </div>
              <div class="settings-row">
                <div><div class="settings-row-title">Compatibilidad</div>
                  <div class="settings-row-desc">Google Authenticator · Authy · 1Password</div></div>
                <span class="badge badge-ghost">TOTP RFC 6238</span>
              </div>
              <button class="btn btn-outline" style="width:100%;justify-content:center;margin-top:12px" onclick="window.Toast?.info('Configuración MFA disponible próximamente.')">
                ${user.mfa_enabled ? '⚙️ Reconfigurar MFA' : '+ Activar MFA'}
              </button>
            </div>
          </div>

          <div class="content-card">
            <div class="card-header"><div class="card-title">⏱️ Sesión</div></div>
            <div class="card-body">
              ${_fieldRow('Timeout de inactividad', '30 minutos')}
              ${_fieldRow('Token de acceso',         '15 minutos (auto-renovado)')}
              ${_fieldRow('Tipo de sesión',          'sessionStorage — se borra al cerrar pestaña')}
            </div>
          </div>
        </div>
      </div>

      <!-- Audit Log (solo Admin) -->
      ${isAdmin ? `
        <div class="content-card">
          <div class="card-header">
            <div class="card-title">📋 Audit Log del sistema</div>
            <span class="badge badge-purple">Solo ADMIN</span>
          </div>
          <div id="audit-log-content">
            <div style="display:flex;justify-content:center;padding:36px"><div class="spinner"></div></div>
          </div>
        </div>` : `
        <div class="alert-card warning">
          <div class="alert-icon">🔒</div>
          <div><div class="alert-title">Acceso restringido</div>
            <div class="alert-desc">El audit log completo solo está disponible para administradores del sistema.</div>
          </div>
        </div>`}`;

    // Cambio de contraseña (UI only — backend route pendiente)
    container.querySelector('#btn-change-pwd')?.addEventListener('click', () => {
      const current  = container.querySelector('#sec-pwd-current')?.value;
      const newPwd   = container.querySelector('#sec-pwd-new')?.value;
      const confirm  = container.querySelector('#sec-pwd-confirm')?.value;
      if (!current || !newPwd) { window.Toast?.warning('Completa todos los campos.'); return; }
      if (newPwd !== confirm)  { window.Toast?.error('Las contraseñas no coinciden.'); return; }
      if (newPwd.length < 8)   { window.Toast?.error('La contraseña debe tener al menos 8 caracteres.'); return; }
      window.Toast?.info('Cambio de contraseña: endpoint disponible en Fase 2.');
    });

    // Cargar audit log si es admin
    if (isAdmin) _loadAuditLog(container);
  },
};

async function _loadAuditLog(container) {
  const el = container.querySelector('#audit-log-content');
  if (!el) return;
  try {
    const { default: client } = await import('../api/client.js');
    const res  = await client.get('/audit?limit=50');
    const logs = res?.data ?? [];
    if (!logs.length) { el.innerHTML = `<div class="empty-state" style="padding:32px"><div class="icon">📋</div><div class="title">Sin registros aún</div></div>`; return; }

    const { default: Table } = await import('../components/table.js');
    Table.audit(el, logs);
  } catch (err) {
    el.innerHTML = `<div class="empty-state" style="padding:32px"><div class="icon">🔒</div><div class="title">Sin permisos para ver el audit log</div></div>`;
  }
}
