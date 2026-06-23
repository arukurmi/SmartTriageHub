"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PlayerProfile from '@/components/PlayerProfile';
import Link from 'next/link';

export default function ProfilePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (data) setProfile(data);
      if (error) throw error;
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="layout-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <h2 className="loading-text">Loading profile...</h2>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="layout-container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>You must be logged in to view your profile.</h2>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>Return Home</Link>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <header className="navbar">
        <h1 className="navbar-title">SmartTriageHub</h1>
        <div className="navbar-actions">
          <Link href="/" className="btn btn-secondary">Back to Quests</Link>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '2rem' }}>Your Developer Dashboard</h2>
        
        <PlayerProfile profile={profile} />

        <div className="card" style={{ marginTop: '2rem' }}>
          <h3>GitHub Integration</h3>
          <p className="text-muted">
            To earn XP and level up automatically, make sure your GitHub Webhooks are configured for this repository. 
            When you merge a PR that "Fixes #123", you will automatically receive XP based on the quest's difficulty score!
          </p>
          <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: `1px solid var(--border-color)` }}>
            <strong>Connected Email:</strong> {session.user.email}
          </div>
        </div>
      </div>
    </div>
  );
}
