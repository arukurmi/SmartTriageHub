const supabase = require('../lib/supabaseAdmin');

/**
 * Resolve the authenticated user from the Supabase JWT in the Authorization
 * header and attach it as req.user. Identity always comes from the verified
 * token — never from the request body or query.
 */
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = data.user;
  req.accessToken = token;
  next();
};

module.exports = requireAuth;
