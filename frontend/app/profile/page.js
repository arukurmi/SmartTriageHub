"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PlayerProfile from '@/components/PlayerProfile';
import Link from 'next/link';

import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';

export default function ProfilePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // GitHub account linking
  const [githubInput, setGithubInput] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linking, setLinking] = useState(false);
  const [mergedPrCount, setMergedPrCount] = useState(null);
  const [syncStatus, setSyncStatus] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (!session) {
        setLoading(false);
        return;
      }

      let data = await fetchProfile(session.user.id);

      // Users who signed in with GitHub already told us who they are —
      // link the username automatically instead of asking them to retype it.
      const oauthUsername = session.user.user_metadata?.user_name;
      if (data && !data.github_username && oauthUsername) {
        const linked = await linkGithubUsername(session, oauthUsername);
        if (linked) data = { ...data, github_username: linked };
      }

      if (data?.github_username) {
        await syncGithubContributions(session);
      }
    };
    init();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        setProfile(data);
        if (data.github_username) setGithubInput(data.github_username);
      }
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Profile fetch error:", e);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Pull freshly merged PRs from GitHub so the dashboard reflects them
  // immediately instead of waiting for the server-side cron.
  const syncGithubContributions = async (session) => {
    setSyncStatus('Syncing your merged PRs from GitHub...');
    try {
      const res = await fetch(`${API_URL}/api/profile/sync-github`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      setMergedPrCount(data.merged_pr_count);
      if (data.profile) setProfile((prev) => ({ ...prev, ...data.profile }));
      setSyncStatus(
        data.newly_credited > 0
          ? `Credited ${data.newly_credited} new merged PR${data.newly_credited > 1 ? 's' : ''}! 🎉`
          : ''
      );
    } catch (err) {
      console.error('GitHub sync error:', err);
      setSyncStatus('');
    }
  };

  const linkGithubUsername = async (session, username) => {
    try {
      const res = await fetch(`${API_URL}/api/profile/github`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ github_username: username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link account');

      setProfile((prev) => ({ ...prev, github_username: data.github_username }));
      setGithubInput(data.github_username);
      setLinkStatus(`Linked to @${data.github_username} ✓`);
      return data.github_username;
    } catch (err) {
      console.error('GitHub link error:', err);
      setLinkStatus(`Error: ${err.message}`);
      return null;
    }
  };

  const handleLinkGithub = async (e) => {
    e.preventDefault();
    setLinking(true);
    setLinkStatus('Linking...');
    const linked = await linkGithubUsername(session, githubInput.trim());
    if (linked) await syncGithubContributions(session);
    setLinking(false);
  };

  const handleSignOut = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    await supabase.auth.signOut();
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
    <>
      <GlobalHeader 
        handleSignOut={handleSignOut} 
        showSearch={false}
      />

      <div className="layout-container">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/board" className="btn btn-secondary">Back to Quests</Link>
        </div>

        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '2rem' }}>Your Developer Dashboard</h2>
          
          <PlayerProfile profile={profile} mergedPrCount={mergedPrCount} />

          {syncStatus && (
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
              {syncStatus}
            </p>
          )}

          <div className="card" style={{ marginTop: '2rem' }}>
            <h3>GitHub Integration</h3>
            <p className="text-muted">
              Link your GitHub account so merged pull requests are credited to you.
              When you merge a PR that "Fixes #123", you automatically receive XP based
              on the quest's difficulty score.
            </p>

            <form onSubmit={handleLinkGithub} style={{ marginTop: '1.5rem' }}>
              <label htmlFor="github-username" className="text-muted" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                GitHub username
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  id="github-username"
                  type="text"
                  className="input-field"
                  placeholder="octocat"
                  value={githubInput}
                  onChange={(e) => setGithubInput(e.target.value)}
                  style={{ flex: 1, minWidth: '200px' }}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={linking}>
                  {profile?.github_username ? 'Update' : 'Link Account'}
                </button>
              </div>
              {linkStatus && (
                <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                  {linkStatus}
                </p>
              )}
            </form>

            {profile?.github_username && (
              <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: `1px solid var(--border-color)` }}>
                <strong>Linked GitHub:</strong> @{profile.github_username}
              </div>
            )}

            <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: `1px solid var(--border-color)` }}>
              <strong>Connected Email:</strong> {session.user.email}
            </div>
          </div>
        </div>
      </div>

      <GlobalFooter />
    </>
  );
}
