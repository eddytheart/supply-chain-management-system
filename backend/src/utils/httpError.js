// Small helper: throw httpError(404, 'Not found') anywhere; errorHandler turns it into a JSON reply.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { httpError };
