/**
 * router.js — Router SPA con History API
 *
 * Mapea rutas URL → módulos de página.
 * Cada página exporta init(container) que monta el HTML y bindea eventos.
 *
 * Rutas disponibles:
 *   /dashboard, /inventario, /fefo, /ingreso, /alertas,
 *   /stock-critico, /consulta, /sugerencias, /perfil,
 *   /configuracion, /seguridad
 */

// Títulos del topbar por ruta
const ROUTES = {
  '/dashboard':     { title: 'Dashboard',              module: () => import('./pages/dashboard.js') },
  '/inventario':    { title: 'Inventario Completo',    module: () => import('./pages/inventario.js') },
  '/fefo':          { title: 'FEFO — Cola de Lotes',   module: () => import('./pages/fefo.js') },
  '/ingreso':       { title: 'Ingreso de Productos',   module: () => import('./pages/ingreso.js') },
  '/alertas':       { title: 'Centro de Alertas',      module: () => import('./pages/alertas.js') },
  '/stock-critico': { title: 'Stock Crítico',          module: () => import('./pages/stock-critico.js') },
  '/consulta':      { title: 'Consulta Visual',        module: () => import('./pages/consulta.js') },
  '/sugerencias':   { title: 'Sugerencias IA',         module: () => import('./pages/sugerencias.js') },
  '/perfil':        { title: 'Mi Perfil',              module: () => import('./pages/perfil.js') },
  '/configuracion': { title: 'Configuración',          module: () => import('./pages/configuracion.js') },
  '/seguridad':     { title: 'Seguridad',              module: () => import('./pages/seguridad.js') },
};

const DEFAULT_ROUTE = '/dashboard';

class Router {
  constructor() {
    this._container   = null;   // elemento DOM donde se montan las páginas
    this._topbarTitle = null;   // elemento del título del topbar
    this._currentPath = null;
  }

  /** Inicializar el router. Llamar una vez desde main.js */
  init(containerSelector = '#page-content', titleSelector = '#topbar-title') {
    this._container   = document.querySelector(containerSelector);
    this._topbarTitle = document.querySelector(titleSelector);

    // Escuchar navegación con botones atrás/adelante
    window.addEventListener('popstate', () => this._load(location.pathname));

    // Navegar a la ruta actual
    const path = location.pathname === '/' ? DEFAULT_ROUTE : location.pathname;
    this._load(path, false);  // false = sin pushState (ya estamos aquí)
  }

  /**
   * Navegar a una ruta.
   * @param {string} path — ej: '/inventario'
   */
  navigate(path) {
    if (path === this._currentPath) return;
    history.pushState({}, '', path);
    this._load(path);
  }

  /** Actualizar nav items activos en el sidebar */
  _updateNav(path) {
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === path);
    });
  }

  /** Cargar página (lazy import) */
  async _load(path, pushState = true) {
    const route = ROUTES[path] ?? ROUTES[DEFAULT_ROUTE];
    const resolvedPath = ROUTES[path] ? path : DEFAULT_ROUTE;

    if (!this._container) return;

    this._currentPath = resolvedPath;
    this._updateNav(resolvedPath);

    // Actualizar título del topbar
    if (this._topbarTitle) {
      this._topbarTitle.textContent = route.title;
    }

    // Mostrar spinner mientras carga el módulo
    this._container.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;height:60vh;">
        <div class="spinner spinner-lg"></div>
      </div>`;

    try {
      const mod = await route.module();
      if (typeof mod.default?.init === 'function') {
        await mod.default.init(this._container);
      } else if (typeof mod.init === 'function') {
        await mod.init(this._container);
      }
    } catch (err) {
      console.error(`[Router] Error cargando ${resolvedPath}:`, err);
      this._container.innerHTML = `
        <div class="empty-state">
          <div class="icon">⚠️</div>
          <div class="title">Error al cargar la página</div>
          <div class="desc">${err.message}</div>
        </div>`;
    }
  }
}

// Exportar instancia singleton
const router = new Router();
export default router;
