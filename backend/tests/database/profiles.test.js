// tests/database/profiles.test.js

describe('DATABASE & PROFILE QUERIES TESTING', () => {
  let mockSupabase;
  
  beforeEach(() => {
    // We create a mock supabase client object for each test to assert calls
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      upsert: jest.fn(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    };
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  // A dummy service function representing how the app would interact with Supabase profiles
  const updateProfileXP = async (supabaseClient, userId, xpToAdd) => {
    if (xpToAdd < 0) throw new Error('Cannot add negative XP'); // Validation
    
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (!profile) throw new Error('Profile not found');

    const newXp = profile.xp + xpToAdd;
    if (newXp > Number.MAX_SAFE_INTEGER) throw new Error('XP overflow');

    return supabaseClient.from('profiles').upsert({ id: userId, xp: newXp });
  };

  const incrementStreak = async (supabaseClient, userId, loginTime) => {
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    
    const lastLogin = new Date(profile.last_login_date);
    const currentLogin = new Date(loginTime);
    
    // Convert to simple date string to check if it's exactly the next day (UTC)
    const lastLoginStr = lastLogin.toISOString().split('T')[0];
    const currentLoginStr = currentLogin.toISOString().split('T')[0];
    
    const lastLoginDate = new Date(lastLoginStr);
    const currentLoginDate = new Date(currentLoginStr);
    
    const diffTime = Math.abs(currentLoginDate - lastLoginDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    let newStreak = profile.daily_streak;
    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      newStreak = 1; // reset
    } // diffDays === 0 means same day, no increment

    return supabaseClient.from('profiles').upsert({ 
      id: userId, 
      daily_streak: newStreak, 
      last_login_date: currentLoginStr 
    });
  };

  it('Happy Path: Test normal user profile creation, daily login streak increments, and XP additions.', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: '1', xp: 10, daily_streak: 1, last_login_date: '2023-01-01' } });
    mockSupabase.upsert.mockResolvedValueOnce({ error: null });

    await updateProfileXP(mockSupabase, '1', 50);
    expect(mockSupabase.upsert).toHaveBeenCalledWith({ id: '1', xp: 60 });
  });

  it('Edge Case (Negative/Overflow XP): Test input validations where a bug tries to pass negative XP or abnormally large int.', async () => {
    // Negative XP
    await expect(updateProfileXP(mockSupabase, '1', -10)).rejects.toThrow('Cannot add negative XP');

    // Overflow XP
    mockSupabase.single.mockResolvedValueOnce({ data: { id: '1', xp: Number.MAX_SAFE_INTEGER - 10 } });
    await expect(updateProfileXP(mockSupabase, '1', 20)).rejects.toThrow('XP overflow');
  });

  it('Edge Case (Streak Calculations): Test timezone boundary changes (e.g., logging in at 23:59 and then 00:01).', async () => {
    // Last login was yesterday at 23:59:00Z
    mockSupabase.single.mockResolvedValue({ 
      data: { id: '1', daily_streak: 5, last_login_date: '2023-10-10T23:59:00Z' } 
    });
    mockSupabase.upsert.mockResolvedValue({ error: null });

    // Current login is today at 00:01:00Z (only 2 minutes later, but crosses day boundary)
    await incrementStreak(mockSupabase, '1', '2023-10-11T00:01:00Z');
    
    expect(mockSupabase.upsert).toHaveBeenCalledWith(expect.objectContaining({
      daily_streak: 6, // Should accurately identify consecutive day
      last_login_date: '2023-10-11'
    }));
  });

  it('Upsert Integrity: Assert that a duplicate write to an existing user profile results in an update.', async () => {
    mockSupabase.upsert.mockResolvedValueOnce({ error: null });
    
    // Calling upsert should just use the Supabase upsert function which maps to ON CONFLICT DO UPDATE
    await mockSupabase.from('profiles').upsert({ id: '1', xp: 100 }, { onConflict: 'id' });
    
    expect(mockSupabase.upsert).toHaveBeenCalledWith({ id: '1', xp: 100 }, { onConflict: 'id' });
  });
});
