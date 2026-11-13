const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = require('../lib/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');

/** One client per request: a shared anon client keeps the last login's session for every caller. */
const createAnonClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Basic, permissive email shape check — Supabase does authoritative validation,
// this just rejects obvious junk before we make a network call.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (typeof email !== 'string' || !EMAIL.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Supabase prevents email enumeration by returning a fake success if the user already exists.
  // We can detect this by checking if the identities array is empty.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return res.status(400).json({ error: 'An account with this email already exists. Please log in instead.' });
  }
  
  res.json({ session: data.session, user: data.user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ session: data.session, user: data.user });
});

router.post('/logout', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(req.accessToken, 'local');
  if (error) {
    console.error('Logout failed:', error.message);
    return res.status(500).json({ error: 'Could not log out' });
  }
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
