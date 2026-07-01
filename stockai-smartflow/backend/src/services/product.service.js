'use strict';
const { Op, fn, col, literal } = require('sequelize');
const { Product, Batch, StockThreshold, sequelize } = require('../models');
const { BATCH_STATUS, PAGINATION } = require('../config/constants');
const { Errors } = require('../middleware/error.middleware');

class ProductService {

  async list({ page = 1, limit = PAGINATION.DEFAULT_LIMIT, search, category, location, status, expiring, algorithm, sort = 'name', order = 'ASC' } = {}) {
    limit = Math.min(+limit, PAGINATION.MAX_LIMIT);
    const where = { is_active: true };
    if (category)  where.category = category;
    if (algorithm) where.algorithm = algorithm;
    if (location)  where.location = { [Op.iLike]: `${location}%` };
    if (search)    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { sku:  { [Op.iLike]: `%${search}%` } },
    ];

    const validSorts = ['name', 'sku', 'price_sale', 'created_at'];
    const sortCol = validSorts.includes(sort) ? sort : 'name';

    const { rows, count } = await Product.findAndCountAll({
      where,
      limit,
      offset: (+page - 1) * limit,
      order:  [[sortCol, order === 'DESC' ? 'DESC' : 'ASC']],
      include: [{
        association: 'batches',
        attributes: [],
        where: { status: BATCH_STATUS.ACTIVE },
        required: false,
      }, {
        association: 'threshold',
        attributes: ['critical_stock', 'min_order_qty'],
      }],
      attributes: {
        include: [
          [fn('COALESCE', fn('SUM', col('batches.quantity')), 0), 'total_stock'],
          [fn('MIN', col('batches.fecha_alerta')), 'nearest_alert'],
          [fn('MIN', col('batches.expiry_date')), 'nearest_expiry'],
        ],
      },
      group: ['Product.id', 'threshold.id'],
      subQuery: false,
    });

    let data = rows.map(p => this._withStatus(p));

    // Filtros post-query (dependen de total_stock calculado)
    if (status === 'CRITICAL') data = data.filter(p => p.stock_status === 'CRITICAL');
    if (status === 'LOW')      data = data.filter(p => p.stock_status === 'LOW');
    if (expiring === 'true')   data = data.filter(p => p.algorithm_alert);

    return { data, meta: { total: count.length ?? count, page: +page, limit, pages: Math.ceil((count.length ?? count) / limit) } };
  }

  async findById(id) {
    const p = await Product.findOne({
      where: { id, is_active: true },
      include: [
        { association: 'threshold' },
        { association: 'batches', where: { status: BATCH_STATUS.ACTIVE }, required: false,
          order: [['fecha_alerta', 'ASC']], limit: 1 },
      ],
    });
    if (!p) throw Errors.notFound('Product', id);
    return this._withStatus(p);
  }

  async create(data) {
    return sequelize.transaction(async t => {
      const product = await Product.create(data, { transaction: t });
      if (data.critical_stock != null) {
        await StockThreshold.create({
          product_id:    product.id,
          critical_stock: data.critical_stock,
          min_order_qty: data.min_order_qty || null,
        }, { transaction: t });
      }
      return product;
    });
  }

  async update(id, data) {
    const p = await this.findById(id);
    await sequelize.transaction(async t => {
      await p.update(data, { transaction: t });
      if (data.critical_stock != null) {
        await StockThreshold.upsert(
          { product_id: id, critical_stock: data.critical_stock },
          { transaction: t }
        );
      }
    });
    return this.findById(id);
  }

  async updatePrice(id, price_sale) {
    const p = await this.findById(id);
    if (price_sale <= p.price_cost) throw Errors.business('El precio de venta debe ser mayor al precio de costo.');
    await p.update({ price_sale });
    return { id: p.id, price_sale: p.price_sale, updated_at: p.updatedAt };
  }

  async softDelete(id) {
    const p = await this.findById(id);
    const activeStock = await Batch.sum('quantity', { where: { product_id: id, status: BATCH_STATUS.ACTIVE } });
    if (activeStock > 0) throw Errors.conflict(`El producto tiene ${activeStock} unidades activas. Consume el stock antes de eliminar.`);
    await p.update({ is_active: false });
    await p.destroy(); // paranoid → sets deletedAt
  }

  _withStatus(p) {
    const plain = p.toJSON();
    const stock    = parseInt(plain.total_stock) || 0;
    const critical = plain.threshold?.critical_stock || 0;
    plain.stock_status    = stock <= 0 ? 'CRITICAL' : stock <= critical ? 'LOW' : 'NORMAL';
    plain.algorithm_alert = plain.nearest_alert ? new Date() >= new Date(plain.nearest_alert) : false;
    return plain;
  }
}

module.exports = new ProductService();