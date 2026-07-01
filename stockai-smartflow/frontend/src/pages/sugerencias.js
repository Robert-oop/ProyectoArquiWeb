export function init(container) {
  container.innerHTML = `
    <div class="content-card">
      <div class="card-header">
        <span class="card-title">🗺️ Sugerencias de Reposición</span>
      </div>
      <div class="empty-state">
        <div class="icon">🚧</div>
        <div class="title">Módulo en desarrollo</div>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">
          Las rutas optimizadas de reposición estarán disponibles en la próxima versión.
        </p>
      </div>
    </div>`;
}
