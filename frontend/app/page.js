"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import QuestCard from '@/components/QuestCard';
import PlayerProfile from '@/components/PlayerProfile';
import Link from 'next/link';

export default function Home() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  
  const [profile, setProfile] = useState(null);
  const [issues, setIssues] = useState([]);
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const PAGE_SIZE = 12;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (session) {
      fetchIssues(0, false);
    }
  }, [session, languageFilter, difficultyFilter, searchQuery]);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) setProfile(data);
      if (error) console.error("Profile error:", error);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIssues = async (currentPage = 0, append = false) => {
    if (!append) setLoading(true);
    else setFetchingMore(true);

    try {
      let query = supabase.from('issues').select('*', { count: 'exact' });

      // Apply Filters
      if (languageFilter !== 'All') {
        query = query.eq('language', languageFilter);
      }
      
      if (difficultyFilter !== 'All') {
        if (difficultyFilter === 'Easy (1-3)') query = query.lte('score', 3);
        if (difficultyFilter === 'Medium (4-7)') query = query.gte('score', 4).lte('score', 7);
        if (difficultyFilter === 'Hard (8-10)') query = query.gte('score', 8);
      }

      if (searchQuery.trim() !== '') {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      // Apply Pagination
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await query
        .order('score', { ascending: true })
        .range(from, to);

      if (error) throw error;

      if (append) {
        setIssues(prev => [...prev, ...data]);
      } else {
        setIssues(data);
        setPage(0);
      }

      setHasMore((from + data.length) < count);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchIssues(nextPage, true);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMessage(isLogin ? 'Authenticating...' : 'Joining hub...');
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to authenticate');
      
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } else {
        setAuthMessage('Success! Check your email to confirm your account.');
      }
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIssues([]);
  };

  if (loading && issues.length === 0) {
    return (
      <div className="layout-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <h2 className="loading-text">Loading workspace...</h2>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="layout-container auth-container">
        <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="quest-board-title" style={{ fontSize: '2rem', marginTop: 0 }}>SmartTriageHub</h1>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>Enter your email to join the workspace.</p>
          
          <form className="auth-form" onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="developer@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              required
            />
            <button type="submit" className="btn btn-primary w-full">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
          <div style={{ marginTop: '1rem' }}>
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-link"
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Log in"}
            </button>
          </div>
          {authMessage && <p className="auth-message">{authMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <header className="navbar">
        <h1 className="navbar-title">SmartTriage<span>Hub</span></h1>
        <div className="navbar-actions">
          <button 
            className="theme-toggle" 
            onClick={() => setIsDarkMode(!isDarkMode)}
            aria-label="Toggle theme"
          >
            {isDarkMode ? '🌙' : '☀️'}
          </button>
          <button onClick={handleSignOut} className="btn btn-secondary">Sign Out</button>
        </div>
      </header>

      <div className="profile-section">
        <PlayerProfile profile={profile} />
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <Link href="/profile" className="btn btn-secondary">View Detailed Dashboard</Link>
        </div>
      </div>

      <div className="filters-section">
        <input 
          type="text" 
          placeholder="Search issues by title..." 
          className="input-field search-bar"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <div className="filter-group">
          <select 
            className="input-field select-field"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
          >
            <option value="All">All Languages</option>
            <option value="JavaScript">JavaScript</option>
            <option value="Python">Python</option>
            <option value="TypeScript">TypeScript</option>
            <option value="Go">Go</option>
            <option value="Rust">Rust</option>
          </select>

          <select 
            className="input-field select-field"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
          >
            <option value="All">All Difficulties</option>
            <option value="Easy (1-3)">Easy (1-3)</option>
            <option value="Medium (4-7)">Medium (4-7)</option>
            <option value="Hard (8-10)">Hard (8-10)</option>
          </select>
        </div>
      </div>
      
      {issues.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p className="text-muted">No open issues match your filters. You're all caught up!</p>
        </div>
      ) : (
        <>
          <div className="quest-grid">
            {issues.map(issue => (
              <QuestCard key={issue.id} issue={issue} />
            ))}
          </div>
          
          {hasMore && (
            <div className="load-more-container">
              <button 
                onClick={handleLoadMore} 
                className="btn btn-primary"
                disabled={fetchingMore}
              >
                {fetchingMore ? 'Loading...' : 'Load More Issues'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
