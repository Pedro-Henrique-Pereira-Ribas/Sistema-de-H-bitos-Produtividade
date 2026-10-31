/* Erros de serviços de nuvem que podem ser devolvidos ao cliente com segurança. */
'use strict';

function cloudError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code || 'CLOUD_SERVICE_ERROR';
  err.expose = true;
  return err;
}

module.exports = { cloudError };
