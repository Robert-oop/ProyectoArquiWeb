'use strict';
const nodemailer = require('nodemailer');
const { User }   = require('../models');
const { ROLES }  = require('../config/constants');
const logger     = require('../config/logger');

const ALERT_META = {
  FEFO_EXPIRY:    { label: 'Vencimiento FEFO',  color: '#f59e0b', icon: '⏰' },
  STOCK_CRITICAL: { label: 'Stock Crítico',      color: '#ef4444', icon: '🚨' },
  STOCK_LOW:      { label: 'Stock Bajo',         color: '#f97316', icon: '⚠️' },
  MERMA:          { label: 'Merma Registrada',   color: '#8b5cf6', icon: '🗑️' },
};

// Solo ADMIN y MANAGER reciben notificaciones
const NOTIFY_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

class EmailService {
  constructor() {
    this._transporter = null;
    this._enabled     = false;
    this._from        = '';
    this._init();
  }

  _init() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      logger.warn('[EMAIL] SMTP no configurado — notificaciones deshabilitadas. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS en .env');
      return;
    }

    const port   = parseInt(SMTP_PORT || '587', 10);
    const secure = port === 465;

    this._transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    this._from    = SMTP_FROM || `"StockAI SmartFlow" <${SMTP_USER}>`;
    this._enabled = true;
    logger.info(`[EMAIL] SMTP listo: ${SMTP_HOST}:${port} | from: ${this._from}`);
  }

  /**
   * Envía notificación de alerta a todos los ADMIN y MANAGER activos.
   * Fire-and-forget: nunca lanza excepción al caller.
   *
   * @param {object} alert   — instancia Sequelize Alert (type, message)
   * @param {object} product — { name, sku } del producto afectado
   */
  async sendAlertNotification(alert, product) {
    if (!this._enabled) return;

    try {
      const recipients = await User.findAll({
        where:      { role: NOTIFY_ROLES, is_active: true },
        attributes: ['name', 'email'],
      });

      if (!recipients.length) {
        logger.debug('[EMAIL] Sin destinatarios con rol ADMIN/MANAGER');
        return;
      }

      const meta        = ALERT_META[alert.type] || { label: alert.type, color: '#6b7280', icon: '📋' };
      const productName = product?.name || 'Producto';
      const productSku  = product?.sku  || '';
      const subject     = `${meta.icon} [StockAI] ${meta.label} — ${productName}`;
      const html        = this._buildHtml(alert, meta, productName, productSku);
      const to          = recipients.map(u => `"${u.name}" <${u.email}>`).join(', ');

      await this._transporter.sendMail({ from: this._from, to, subject, html });

      logger.info(`[EMAIL] "${alert.type}" → ${recipients.length} destinatario(s): ${recipients.map(u => u.email).join(', ')}`);
    } catch (err) {
      logger.error(`[EMAIL] Error al enviar notificación (${alert.type}): ${err.message}`);
    }
  }

  _buildHtml(alert, meta, productName, productSku) {
    const date = new Date().toLocaleString('es-CL', {
      timeZone:   'America/Santiago',
      dateStyle:  'long',
      timeStyle:  'short',
    });

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:540px;margin:0 auto;">

    <!-- Encabezado coloreado -->
    <div style="background:${meta.color};border-radius:8px 8px 0 0;padding:22px 28px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">
        ${meta.icon}&nbsp; ${meta.label}
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;">
        StockAI SmartFlow &mdash; Notificación automática
      </p>
    </div>

    <!-- Cuerpo -->
    <div style="background:#fff;border-radius:0 0 8px 8px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="color:#6b7280;padding:8px 0;width:110px;vertical-align:top;">Producto</td>
          <td style="font-weight:600;padding:8px 0;">
            ${productName}
            ${productSku ? `<span style="color:#6b7280;font-weight:400;font-size:13px;">&nbsp;(${productSku})</span>` : ''}
          </td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:8px 0;vertical-align:top;">Tipo de alerta</td>
          <td style="padding:8px 0;">
            <span style="display:inline-block;background:${meta.color}22;color:${meta.color};
                         padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;
                         letter-spacing:.5px;">
              ${alert.type}
            </span>
          </td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:8px 0;vertical-align:top;">Detalle</td>
          <td style="padding:8px 0;line-height:1.5;">${alert.message}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:8px 0;vertical-align:top;">Fecha</td>
          <td style="padding:8px 0;color:#374151;">${date}</td>
        </tr>
      </table>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">
          Este correo fue generado automáticamente. Ingresa al sistema para gestionar la alerta.
        </p>
      </div>
    </div>

  </div>
</body>
</html>`;
  }
}

module.exports = new EmailService();
