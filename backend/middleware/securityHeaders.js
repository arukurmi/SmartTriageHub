/**
 * Adds a conservative set of security response headers to every request.
 *
 * This is a dependency-free, API-focused subset of what helmet would apply.
 * The backend only serves JSON (no HTML/scripts of its own), so we omit a
 * Content-Security-Policy and instead lock down MIME sniffing, framing, and
 * referrer leakage, and advertise HSTS for HTTPS deployments.
 */
const securityHeaders = (req, res, next) => {
  // Stop browsers from MIME-sniffing a response away from its declared type.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Disallow being embedded in a frame (clickjacking protection).
  res.setHeader('X-Frame-Options', 'DENY');
  // Never leak the full URL (which may carry tokens/ids) to other origins.
  res.setHeader('Referrer-Policy', 'no-referrer');
  // This is a JSON API — no browser-exposed powerful features are needed.
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Don't advertise the framework/version.
  res.removeHeader('X-Powered-By');
  // Tell browsers to stick to HTTPS once seen (harmless over plain HTTP).
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
};

module.exports = securityHeaders;
