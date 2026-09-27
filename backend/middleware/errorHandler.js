function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  const body = { error: err.message || 'Something went wrong' };
  if (err.retryAfter) body.retryAfterSeconds = err.retryAfter;

  res.status(statusCode).json(body);
}

module.exports = { errorHandler };
