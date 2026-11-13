/** Only errors flagged `expose` (body-parser, http-errors, CORS) reach the client verbatim; the rest become a generic 500. */
const errorHandler = (err, req, res, next) => {
  if (err.expose && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({ error: 'An internal server error occurred.' });
};

module.exports = errorHandler;
