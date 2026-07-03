import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

export default function GlobalHeader({ 
  searchQuery = '', 
  setSearchQuery = null, 
  handleSignOut,
  showSearch = true 
}) {
  const { isDarkMode, toggleTheme } = useTheme();

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
          <Link href="/board" className="gh-header-link">Issues List</Link>
          <Link href="/my-prs" className="gh-header-link">Your GitHub Pull Requests</Link>
          <Link href="/my-issues" className="gh-header-link">Your GitHub Issues</Link>
        </nav>
      </div>
      <div className="gh-header-actions">
        <button 
          className="theme-toggle" 
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {isDarkMode ? '🌙' : '☀️'}
        </button>
        {handleSignOut && (
          <button onClick={handleSignOut} className="btn btn-secondary">Sign Out</button>
        )}
      </div>
    </header>
  );
}
