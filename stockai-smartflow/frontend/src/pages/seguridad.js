export function init(container) {
  container.innerHTML = `
    <div class="content-card" style="max-width:600px;">
      <div class="card-header">
        <span class="card-title">🔐 Seguridad</span>
      </div>
      <div style="padding:28px;display:flex;flex-direction:column;gap:16px;">
        <div style="background:var(--accent-cyan-dim);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:16px;">
          <div style="font-size:13px;color:var(--accent-cyan);font-weight:600;margin-bottom:4px;">MFA activo</div>
          <div style="font-size:13px;color:var(--text-secondary);">
            Tu cuenta está protegida con autenticación de dos factores (TOTP).
          </div>
        </div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Cambio de contraseña</div>
          <div style="font-size:13px;color:var(--text-muted);">Contacta al administrador del sistema para cambiar tu contraseña.</div>
        </div>
      </div>
    </div>`;
}
