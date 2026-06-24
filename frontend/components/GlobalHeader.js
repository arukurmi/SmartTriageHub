import Link from 'next/link';

export default function GlobalHeader({ 
  searchQuery = '', 
  setSearchQuery = null, 
  isDarkMode, 
  setIsDarkMode, 
  handleSignOut,
  showSearch = true 
}) {
  return (
    <header className="gh-header">
      <div className="gh-header-left">
        <Link href="/" className="gh-header-logo">
          <img src="/logo.png" alt="SmartTriageHub Logo" style={{ height: '32px', width: '32px', borderRadius: '4px' }} />
          SmartTriageHub
        </Link>
        
        {showSearch && setSearchQuery && (
          <input 
            type="text" 
            placeholder="Search issues by title..." 
            className="gh-header-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}
        
        <nav className="gh-header-links">
          <a href="https://github.com/pulls" target="_blank" rel="noopener noreferrer" className="gh-header-link">Your GitHub Pull requests</a>
          <a href="https://github.com/issues" target="_blank" rel="noopener noreferrer" className="gh-header-link">Your GitHub Issues</a>
        </nav>
      </div>
      <div className="gh-header-actions">
        {setIsDarkMode && (
          <button 
            className="theme-toggle" 
            onClick={() => setIsDarkMode(!isDarkMode)}
            aria-label="Toggle theme"
          >
            {isDarkMode ? '🌙' : '☀️'}
          </button>
        )}
        {handleSignOut && (
          <button onClick={handleSignOut} className="btn btn-secondary">Sign Out</button>
        )}
      </div>
    </header>
  );
}
