// Catches anything thrown inside a route and returns a clean JSON error.
function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'That value already exists.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'A referenced record does not exist.' });
  }
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong on the server.' });
}

module.exports = { notFound, errorHandler };
