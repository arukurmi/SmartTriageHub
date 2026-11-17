const supabase = require('../lib/supabaseAdmin');

const DEFAULT_AI_DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const aiDailyLimit = () => {
  const limit = Number(process.env.AI_DAILY_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_AI_DAILY_LIMIT;
};

const secondsUntilUtcMidnight = () => Math.ceil((DAY_MS - (Date.now() % DAY_MS)) / 1000);

/** Run after requireAuth. Fails closed: if the counter cannot be updated, no AI call is made. */
const aiQuota = async (req, res, next) => {
  const limit = aiDailyLimit();
  const { data: callsToday, error } = await supabase.rpc('consume_ai_call', {
    p_user_id: req.user.id,
    p_daily_limit: limit,
  });

  if (error) {
    console.error('AI quota check failed:', error.message);
    return res.status(503).json({ error: 'AI is unavailable right now, try again later' });
  }
  if (callsToday === null) {
    res.set('Retry-After', String(secondsUntilUtcMidnight()));
    return res
      .status(429)
      .json({ error: `Daily AI limit of ${limit} requests reached. It resets at midnight UTC.` });
  }
  next();
};

module.exports = aiQuota;
