import Auth from '../api/auth.js';

export function init(container) {
  const user = Auth.currentUser();
  const roleLabel = {
    ROLE_ADMIN:    'Administrador',
    ROLE_MANAGER:  'Jefe de Bodega',
    ROLE_OPERATOR: 'Repositor',
  }[user?.role] ?? user?.role ?? '—';

  container.innerHTML = `
    <div class="content-card" style="max-width:520px;">
      <div class="card-header">
        <span class="card-title">👤 Mi Perfil</span>
      </div>
      <div style="padding:28px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;">
          <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;">
            ${(user?.name ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:18px;font-weight:600;color:var(--text-primary);">${user?.name ?? '—'}</div>
            <div style="font-size:12px;color:var(--accent-cyan);font-family:var(--font-mono);">${roleLabel}</div>
          </div>
        </div>
        <div style="display:grid;gap:12px;">
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px 16px;border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Email</div>
            <div style="font-size:14px;color:var(--text-primary);">${user?.email ?? '—'}</div>
          </div>
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px 16px;border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Rol</div>
            <div style="font-size:14px;color:var(--text-primary);">${roleLabel}</div>
          </div>
        </div>
        <button class="btn btn-danger" style="align-self:flex-start;margin-top:8px;" onclick="Auth?.logout?.() ?? navigate('/dashboard')">
          Cerrar sesión
        </button>
      </div>
    </div>`;
}
