"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const STATE_COLORS = {
  open: 'var(--state-open)',
  merged: 'var(--state-merged)',
  closed: 'var(--state-closed)',
};

const itemState = (item) =>
  item.pull_request?.merged_at ? 'merged' : item.state;

// Lists the linked GitHub user's PRs or issues (all states, merged included)
// via GitHub's public search API. type is 'pr' or 'issue'.
export default function GithubActivityList({ type }) {
  const [session, setSession] = useState(null);
  const [githubUsername, setGithubUsername] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | unauthed | unlinked | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (!session) {
        setStatus('unauthed');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('github_username')
        .eq('id', session.user.id)
        .single();

      if (!profile?.github_username) {
        setStatus('unlinked');
        return;
      }
      setGithubUsername(profile.github_username);

      try {
        const query = encodeURIComponent(`type:${type} author:${profile.github_username}`);
        const res = await fetch(
          `https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=50`,
          { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!res.ok) {
          throw new Error(res.status === 403 ? 'GitHub rate limit hit — try again in a minute.' : `GitHub responded with ${res.status}`);
        }
        const data = await res.json();
        setItems(data.items || []);
        setStatus('ready');
      } catch (err) {
        setErrorMsg(err.message);
        setStatus('error');
      }
    };
    load();
  }, [type]);

  const label = type === 'pr' ? 'pull requests' : 'issues';

  if (status === 'loading') {
    return <h2 className="loading-text" style={{ textAlign: 'center', marginTop: '4rem' }}>Loading your {label}...</h2>;
  }
  if (status === 'unauthed') {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>You must be logged in to view your {label}.</h2>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>Return Home</Link>
      </div>
    );
  }
  if (status === 'unlinked') {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>Link your GitHub account to see your {label}.</h2>
        <Link href="/profile" className="btn btn-primary" style={{ marginTop: '1rem' }}>Go to Profile</Link>
      </div>
    );
  }
  if (status === 'error') {
    return <h2 style={{ textAlign: 'center', marginTop: '4rem' }}>Could not load your {label}: {errorMsg}</h2>;
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>
        Your GitHub {type === 'pr' ? 'Pull Requests' : 'Issues'}
      </h2>
      <p className="text-muted" style={{ marginBottom: '2rem' }}>
        Showing recent {label} authored by @{githubUsername} across all public repositories.
      </p>

      {items.length === 0 && (
        <p className="text-muted">No {label} found for @{githubUsername}.</p>
      )}

      {items.map((item) => {
        const state = itemState(item);
        const repoName = item.repository_url.split('/').slice(-2).join('/');
        return (
          <a
            key={item.id}
            href={item.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="card"
            style={{ display: 'block', marginBottom: '1rem', textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: STATE_COLORS[state] || 'var(--bg-secondary)',
                  color: 'var(--state-badge-text)',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  textTransform: 'capitalize',
                }}
              >
                {state}
              </span>
              <strong>{item.title}</strong>
            </div>
            <div className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {repoName} #{item.number} · updated {new Date(item.updated_at).toLocaleDateString()}
            </div>
          </a>
        );
      })}
    </div>
  );
}
