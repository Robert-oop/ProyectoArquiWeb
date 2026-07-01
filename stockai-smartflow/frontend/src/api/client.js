/**
 * api/client.js — Base HTTP client de StockAI
 *
 * Responsabilidades:
 *  - Adjuntar el token JWT en cada solicitud
 *  - Renovar automáticamente el access_token cuando expira (401)
 *  - Formatear errores con la estructura estándar del API
 *  - Exponer métodos get/post/put/patch/delete/postForm
 *
 * Seguridad:
 *  - Access token en sessionStorage (se borra al cerrar pestaña)
 *  - Refresh token en sessionStorage (en producción migrar a httpOnly cookie)
 *  - Content-Type no se setea en postForm (lo maneja fetch con el boundary)
 */

const BASE_URL = (window._env_?.API_URL) ?? 'http://localhost:3000/api/v1';

// Keys de almacenamiento
const KEYS = {
  ACCESS:  'sai_access',
  REFRESH: 'sai_refresh',
  USER:    'sai_user',
};

// ── Error tipado del API ───────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
    this.code    = code;
    this.details = details;
  }
}

// ── Token helpers (exportados para uso en auth.js) ────────────────────────────
export const tokenStore = {
  getAccess:      ()      => sessionStorage.getItem(KEYS.ACCESS),
  getRefresh:     ()      => sessionStorage.getItem(KEYS.REFRESH),
  getUser:        ()      => { try { return JSON.parse(sessionStorage.getItem(KEYS.USER)); } catch { return null; } },
  setSession:     (data)  => {
    sessionStorage.setItem(KEYS.ACCESS,  data.access_token);
    sessionStorage.setItem(KEYS.REFRESH, data.refresh_token);
    sessionStorage.setItem(KEYS.USER,    JSON.stringify(data.user));
  },
  updateAccess:   (token) => sessionStorage.setItem(KEYS.ACCESS, token),
  clear:          ()      => { sessionStorage.removeItem(KEYS.ACCESS); sessionStorage.removeItem(KEYS.REFRESH); sessionStorage.removeItem(KEYS.USER); },
  isLoggedIn:     ()      => !!sessionStorage.getItem(KEYS.ACCESS),
};

// ── Petición base ─────────────────────────────────────────────────────────────
let _refreshing = false;  // bandera para evitar múltiples refresh simultáneos

async function request(endpoint, options = {}, isRetry = false) {
  const token = tokenStore.getAccess();

  const headers = {
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Solo agregar Content-Type si no es FormData (multipart lo setea solo)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',  // enviar cookies httpOnly si el servidor las usa
  });

  // 204 No Content (DELETE exitoso, logout)
  if (res.status === 204) return null;

  // 401 → renovar token y reintentar UNA vez
  if (res.status === 401 && !isRetry && !_refreshing) {
    _refreshing = true;
    try {
      const refreshed = await _doRefresh();
      _refreshing = false;
      if (refreshed) return request(endpoint, options, true);
      // No se pudo renovar → redirigir al login
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return null;
    } catch {
      _refreshing = false;
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return null;
    }
  }

  // Parsear cuerpo
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error   ?? 'API_ERROR',
      body?.message ?? `Error HTTP ${res.status}`,
      body?.details ?? null
    );
  }

  return body;
}

async function _doRefresh() {
  const rt = tokenStore.getRefresh();
  if (!rt) return false;
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: rt }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (data?.access_token) {
    tokenStore.updateAccess(data.access_token);
    return true;
  }
  return false;
}

// ── API pública ───────────────────────────────────────────────────────────────
const client = {
  get:      (url, opts = {})       => request(url, { method: 'GET', ...opts }),
  post:     (url, body, opts = {}) => request(url, { method: 'POST',   body: JSON.stringify(body), ...opts }),
  put:      (url, body, opts = {}) => request(url, { method: 'PUT',    body: JSON.stringify(body), ...opts }),
  patch:    (url, body, opts = {}) => request(url, { method: 'PATCH',  body: JSON.stringify(body), ...opts }),
  delete:   (url, opts = {})       => request(url, { method: 'DELETE', ...opts }),

  /** POST multipart/form-data — para imágenes del módulo IA */
  postForm: (url, formData)        => request(url, { method: 'POST', body: formData }),
};

export default client;
