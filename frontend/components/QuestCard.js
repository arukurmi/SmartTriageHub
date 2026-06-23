import React from 'react';

export default function QuestCard({ issue }) {
  // Determine tier based on AI score (1-10)
  // 1-3: Copper
  // 4-7: Silver
  // 8-10: Mythic
  let tier = 'copper';
  if (issue.score >= 4 && issue.score <= 7) tier = 'silver';
  if (issue.score >= 8) tier = 'mythic';

  return (
    <a href={issue.url} target="_blank" rel="noopener noreferrer" className={`quest-card ${tier}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <h3 className="quest-title">{issue.title}</h3>
      <p className="quest-summary">{issue.summary}</p>
      
      <div className="quest-footer">
        <span className="quest-lang">{issue.language}</span>
        <span className="quest-difficulty">Difficulty: {issue.score}/10</span>
      </div>
    </a>
  );
}
