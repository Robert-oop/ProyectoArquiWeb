/**
 * api/auth.js — Módulo de autenticación StockAI
 * Endpoints: POST /auth/login | POST /auth/logout | POST /auth/refresh | GET /auth/me
 */
import client, { tokenStore } from './client.js';

const Auth = {
  /**
   * Login con email + password + código MFA.
   * Guarda tokens y datos del usuario en sessionStorage.
   * @returns {object} user — datos del usuario autenticado
   */
  async login(email, password, mfaCode = '') {
    const data = await client.post('/auth/login', {
      email,
      password,
      mfa_code: mfaCode || undefined,
    });
    if (!data?.access_token) throw new Error('Respuesta de login inválida.');
    tokenStore.setSession(data);
    return data.user;
  },

  /**
   * Cierra sesión: invalida el token en el servidor y limpia sessionStorage.
   */
  async logout() {
    try { await client.post('/auth/logout', {}); } catch { /* ignorar */ }
    tokenStore.clear();
    window.location.reload();
  },

  /**
   * Retorna los datos del usuario actualmente autenticado desde sessionStorage.
   * Si no existe, los obtiene del servidor.
   */
  async me() {
    const cached = tokenStore.getUser();
    if (cached) return cached;
    const user = await client.get('/auth/me');
    if (user) sessionStorage.setItem('sai_user', JSON.stringify(user));
    return user;
  },

  /** ¿Hay sesión activa? */
  isLoggedIn: () => tokenStore.isLoggedIn(),

  /** Datos del usuario actual (sincrónico, desde sessionStorage) */
  currentUser: () => tokenStore.getUser(),

  /**
   * Cambiar contraseña — verifica la contraseña actual antes de actualizar.
   * @param {string} currentPassword
   * @param {string} newPassword
   */
  changePassword: (currentPassword, newPassword) =>
    client.post('/auth/change-password', {
      current_password: currentPassword,
      new_password:     newPassword,
    }),
};

export default Auth;
