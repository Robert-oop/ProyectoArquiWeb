'use strict';
const jwt       = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { User }  = require('../models');
const { Errors } = require('../middleware/error.middleware');
const { JWT }   = require('../config/constants');

class AuthService {

  /* ── Login: valida credenciales + MFA, retorna tokens ─────────────────────── */
  async login({ email, password, mfaCode }) {
    const user = await User.findOne({ where: { email, is_active: true } });
    if (!user) throw Errors.unauthorized('Credenciales inválidas.');

    const valid = await user.validatePassword(password);
    if (!valid) throw Errors.unauthorized('Credenciales inválidas.');

    // Validar TOTP MFA si está habilitado
    if (user.mfa_enabled) {
      const verified = speakeasy.totp.verify({
        secret:   user.mfa_secret,
        encoding: 'base32',
        token:    mfaCode,
        window:   1,  // ±30 segundos de tolerancia
      });
      if (!verified) throw Errors.unauthorized('Código MFA inválido o expirado.');
    }

    user.last_login = new Date();
    await user.save();

    const tokens = this._generateTokens(user);
    return { ...tokens, user: user.toSafeJSON() };
  }

  /* ── Refresh: rota el refresh token ──────────────────────────────────────── */
  async refresh(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw Errors.unauthorized('Refresh token inválido o expirado.');
    }

    const user = await User.findOne({ where: { id: payload.sub, is_active: true } });
    if (!user) throw Errors.unauthorized('Usuario no encontrado.');

    const { access_token } = this._generateTokens(user);
    return { access_token, expires_in: 900 };
  }

  /* ── Cambiar contraseña — verifica la actual antes de actualizar ────────── */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findOne({ where: { id: userId, is_active: true } });
    if (!user) throw Errors.notFound('User', userId);

    const valid = await user.validatePassword(currentPassword);
    if (!valid) throw Errors.unauthorized('La contraseña actual es incorrecta.');

    if (currentPassword === newPassword) {
      throw Errors.business('La nueva contraseña debe ser diferente a la actual.');
    }

    // El hook beforeSave del modelo hashea automáticamente cuando password_hash cambia
    user.password_hash = newPassword;
    await user.save();

    return { message: 'Contraseña actualizada correctamente.' };
  }

  /* ── Generar par access + refresh tokens ────────────────────────────────── */
  _generateTokens(user) {
    const payload = { sub: user.id, role: user.role, email: user.email };

    const access_token  = jwt.sign(payload, process.env.JWT_SECRET,
      { expiresIn: JWT.ACCESS_EXPIRE });                         // 15m

    const refresh_token = jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET,
      { expiresIn: JWT.REFRESH_EXPIRE });                        // 7d

    return { access_token, refresh_token, token_type: 'Bearer', expires_in: 900 };
  }
}

module.exports = new AuthService();
