/**
 * Run after requireAuth. Admins are confirmed emails listed in ADMIN_EMAILS; unset means nobody.
 * An unconfirmed email is refused so a signup with an admin's address gains nothing.
 */
const requireAdmin = (req, res, next) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = req.user?.email?.toLowerCase();

  if (!email || !req.user.email_confirmed_at || !adminEmails.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = requireAdmin;
