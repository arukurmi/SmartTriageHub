"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import QuestCard from '@/components/QuestCard';
import PlayerProfile from '@/components/PlayerProfile';

export default function Home() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  
  const [profile, setProfile] = useState(null);
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchData(session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchData(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async (userId) => {
    setLoading(true);
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profileData) setProfile(profileData);
      else if (profileError) console.error("Error fetching profile:", profileError);

      // Fetch issues
      const { data: issuesData, error: issuesError } = await supabase
        .from('issues')
        .select('*')
        .order('score', { ascending: false });

      if (issuesData) setIssues(issuesData);
      else if (issuesError) console.error("Error fetching issues:", issuesError);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMessage(isLogin ? 'Authenticating...' : 'Joining guild...');
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

  if (loading) {
    return (
      <div className="layout-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <h2 style={{ color: 'var(--accent-gold)' }}>Loading the realm...</h2>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="layout-container auth-container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="quest-board-title" style={{ fontSize: '2rem', marginTop: 0 }}>SmartTriageHub</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Enter your email to join the guild.</p>
          
          <form className="auth-form" onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="adventurer@guild.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              required
            />
            <input
              type="password"
              placeholder="Your secret passphrase"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              required
            />
            <button type="submit" className="btn">
              {isLogin ? 'Enter Guild' : 'Join Guild'}
            </button>
          </form>
          <div style={{ marginTop: '1rem' }}>
            <button 
              onClick={() => setIsLogin(!isLogin)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
            >
              {isLogin ? "Need an account? Sign up" : "Already in the guild? Log in"}
            </button>
          </div>
          {authMessage && <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>{authMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="quest-board-title" style={{ margin: 0 }}>Quest Board</h1>
        <button onClick={handleSignOut} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Leave Guild</button>
      </div>

      <PlayerProfile profile={profile} />

      <h2 style={{ marginBottom: '1.5rem', color: 'var(--accent-gold)' }}>Available Quests</h2>
      
      {issues.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No quests available at the moment. The realm is at peace.</p>
        </div>
      ) : (
        <div className="quest-grid">
          {issues.map(issue => (
            <QuestCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}
