export function init(container) {
  container.innerHTML = `
    <div class="content-card" style="max-width:600px;">
      <div class="card-header">
        <span class="card-title">⚙️ Configuración del Sistema</span>
      </div>
      <div class="empty-state">
        <div class="icon">🔧</div>
        <div class="title">Solo disponible para administradores</div>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">
          Configuración de umbrales, notificaciones y parámetros del sistema.
        </p>
      </div>
    </div>`;
}
