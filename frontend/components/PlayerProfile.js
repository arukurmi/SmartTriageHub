import React from 'react';

export default function PlayerProfile({ profile }) {
  if (!profile) return null;

  const { xp, level, daily_streak } = profile;
  
  // Calculate XP percentage to next level (assuming 100 XP per level for demo)
  const xpForNextLevel = level * 100;
  const currentLevelXp = xp % 100;
  const progressPercent = Math.min(100, Math.max(0, (currentLevelXp / 100) * 100));

  return (
    <div className="player-profile glass-panel">
      <div>
        <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-primary)' }}>Developer Profile</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Level {level}</div>
          <div className="xp-bar-container">
            <div className="xp-bar-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{xp} / {level * 100} XP</div>
        </div>
      </div>
      
      <div className="profile-stats">
        <div className="stat-box">
          <div className="stat-value">{daily_streak}</div>
          <div className="stat-label">Daily Streak</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{xp}</div>
          <div className="stat-label">Total XP</div>
        </div>
      </div>
    </div>
  );
}
