'use strict';
const { Errors } = require('./error.middleware');

/**
 * Middleware factory de validación con Joi.
 * Uso: router.post('/', validate(myJoiSchema), controller)
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly:  false,  // reportar todos los errores, no solo el primero
      stripUnknown: true,  // eliminar campos no definidos en el schema
    });

    if (error) {
      const details = error.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return next(Errors.validation(details));
    }

    req[source] = value;  // reemplazar con el valor sanitizado
    next();
  };
}

module.exports = { validate };
