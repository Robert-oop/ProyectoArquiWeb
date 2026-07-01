'use strict';
const nodemailer = require('nodemailer');
const logger     = require('../config/logger');

/**
 * NotificationService — Envío de alertas por email y SMS.
 *
 * Configuración vía variables de entorno (.env):
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM
 *   ADMIN_EMAIL, ADMIN_PHONE
 *
 * Si las variables no están configuradas, los métodos loguean y retornan
 * sin lanzar error para no interrumpir la operación principal.
 */
class NotificationService {

  constructor() {
    this._transporter = null;
    this._twilioClient = null;
  }

  // ── Email ────────────────────────────────────────────────────────────────────

  /**
   * Retorna el transporter de nodemailer (lazy init).
   * Si no hay config de email, retorna null.
   */
  _getTransporter() {
    if (this._transporter) return this._transporter;

    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) return null;

    this._transporter = nodemailer.createTransport({
      host:   EMAIL_HOST,
      port:   parseInt(EMAIL_PORT || '587'),
      secure: EMAIL_PORT === '465',
      auth:   { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    return this._transporter;
  }

  /**
   * Envia un email genérico.
   * @param {string}   to      - destinatario
   * @param {string}   subject - asunto
   * @param {string}   html    - cuerpo HTML
   */
  async sendEmail(to, subject, html) {
    const transporter = this._getTransporter();
    if (!transporter) {
      logger.warn('[NOTIFY:EMAIL] Sin configurar. Omitiendo envío.');
      return false;
    }

    try {
      const info = await transporter.sendMail({
        from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
      });
      logger.info(`[NOTIFY:EMAIL] Enviado a ${to} — messageId: ${info.messageId}`);
      return true;
    } catch (err) {
      logger.error(`[NOTIFY:EMAIL] Error al enviar a ${to}: ${err.message}`);
      return false;
    }
  }

  // ── SMS (Twilio) ─────────────────────────────────────────────────────────────

  /**
   * Retorna el cliente Twilio (lazy init).
   * Si no hay config, retorna null.
   */
  _getTwilio() {
    if (this._twilioClient) return this._twilioClient;

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;

    // Importación lazy: Twilio es opcional
    try {
      const twilio = require('twilio');
      this._twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    } catch {
      logger.warn('[NOTIFY:SMS] Librería twilio no instalada. Omitiendo SMS.');
      return null;
    }

    return this._twilioClient;
  }

  /**
   * Envía un SMS.
   * @param {string} to   - número destino con código de país: +56912345678
   * @param {string} body - texto del mensaje (máx 160 chars)
   */
  async sendSMS(to, body) {
    const client = this._getTwilio();
    if (!client) {
      logger.warn('[NOTIFY:SMS] Sin configurar. Omitiendo SMS.');
      return false;
    }

    try {
      const msg = await client.messages.create({
        from: process.env.TWILIO_PHONE_FROM,
        to,
        body: body.substring(0, 160),
      });
      logger.info(`[NOTIFY:SMS] Enviado a ${to} — SID: ${msg.sid}`);
      return true;
    } catch (err) {
      logger.error(`[NOTIFY:SMS] Error al enviar a ${to}: ${err.message}`);
      return false;
    }
  }

  // ── Templates de negocio ────────────────────────────────────────────────────

  /**
   * Alerta de stock crítico — email + SMS al manager/admin.
   */
  async sendCriticalStockAlert({ productName, sku, currentStock, criticalStock }) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPhone = process.env.ADMIN_PHONE;

    const subject = `🚨 StockAI — Stock Crítico: ${productName}`;
    const html = `
      <h2 style="color:#B91C1C">⚠️ Alerta de Stock Crítico</h2>
      <p><strong>Producto:</strong> ${productName} (${sku})</p>
      <p><strong>Stock actual:</strong> <span style="color:#B91C1C">${currentStock} unidades</span></p>
      <p><strong>Umbral crítico:</strong> ${criticalStock} unidades</p>
      <p>Por favor genere una orden de compra a la brevedad.</p>
      <hr>
      <small>StockAI — Sistema de Gestión de Bodega</small>
    `;

    const smsText = `[StockAI] STOCK CRÍTICO: ${productName} (${sku}). Stock: ${currentStock} / mín: ${criticalStock}. Requiere orden de compra.`;

    const results = await Promise.allSettled([
      adminEmail ? this.sendEmail(adminEmail, subject, html) : Promise.resolve(false),
      adminPhone ? this.sendSMS(adminPhone, smsText)         : Promise.resolve(false),
    ]);

    return results;
  }

  /**
   * Alerta de vencimiento FEFO — email al manager.
   */
  async sendExpiryAlert({ productName, lotNumber, expiryDate, daysToExpiry }) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return false;

    const urgency  = daysToExpiry <= 7 ? '🔴 URGENTE' : '🟡 Atención';
    const subject  = `${urgency} — Vence en ${daysToExpiry} días: ${productName}`;
    const html = `
      <h2>⏰ Alerta de Vencimiento FEFO</h2>
      <p><strong>Producto:</strong> ${productName}</p>
      <p><strong>Lote:</strong> ${lotNumber}</p>
      <p><strong>Vence:</strong> ${expiryDate} (en ${daysToExpiry} días)</p>
      <p>Priorizar despacho de este lote según regla FEFO.</p>
      <hr>
      <small>StockAI — Sistema de Gestión de Bodega</small>
    `;

    return this.sendEmail(adminEmail, subject, html);
  }

  /**
   * Resumen diario de la bodega — email al admin con estadísticas.
   * Llamado por dailySummary.job.js.
   */
  async sendDailySummary(summary) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return false;

    const { date, alerts, batches, total_products } = summary;
    const subject = `📊 StockAI — Resumen diario ${date}`;

    const html = `
      <h2>📊 Resumen Diario de Bodega</h2>
      <p><strong>Fecha:</strong> ${date}</p>

      <h3>Alertas activas</h3>
      <ul>
        <li>🚨 Stock Crítico: <strong>${alerts.critical_stock}</strong></li>
        <li>⚠️ Stock Bajo: <strong>${alerts.low_stock}</strong></li>
        <li>⏰ FEFO / Vencimientos: <strong>${alerts.fefo_expiry}</strong></li>
        <li><strong>Total activas: ${alerts.total_active}</strong></li>
      </ul>

      <h3>Lotes</h3>
      <ul>
        <li>Vencen esta semana: <strong>${batches.expiring_this_week}</strong></li>
        <li>Vencidos sin procesar: <strong style="color:#B91C1C">${batches.overdue_expired}</strong></li>
      </ul>

      <p>Total productos activos: <strong>${total_products}</strong></p>
      <hr>
      <small>StockAI — Sistema de Gestión de Bodega</small>
    `;

    return this.sendEmail(adminEmail, subject, html);
  }
}

module.exports = new NotificationService();
