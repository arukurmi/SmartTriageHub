import React from 'react';

export function difficultyTier(score) {
  if (score >= 8) return 'difficulty-hard';
  if (score >= 4) return 'difficulty-medium';
  return 'difficulty-easy';
}

export default function QuestCard({ issue }) {
  const tier = difficultyTier(issue.score);

  return (
    <a href={issue.url} target="_blank" rel="noopener noreferrer" className={`quest-card ${tier}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <h3 className="quest-title">{issue.title}</h3>
      <p className="quest-summary">{issue.summary}</p>

      <div className="quest-footer">
        <span className="quest-lang">{issue.language}</span>
        <span className={`quest-difficulty ${tier}`}>Difficulty: {issue.score}/10</span>
      </div>
    </a>
  );
}
