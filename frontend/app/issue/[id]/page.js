"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { difficultyTier } from '@/components/QuestCard';

import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';

function useRagRequest(path) {
  const [state, setState] = useState({ loading: false, error: '', data: null });

  const run = async (body) => {
    setState({ loading: true, error: '', data: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const data = await apiFetch(`/api/rag/${path}`, { method: 'POST', token: session?.access_token, body });
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  };

  return [state, run];
}

export default function IssuePage() {
  const { id } = useParams();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [files, suggestFiles] = useRagRequest('context');
  const [summary, summarizeThread] = useRagRequest('thread-summary');

  useEffect(() => {
    supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setIssue(data);
        setLoading(false);
      });
  }, [id]);

  const renderPage = (content) => (
    <>
      <GlobalHeader showSearch={false} />
      <div className="layout-container" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {content}
      </div>
      <GlobalFooter />
    </>
  );

  if (loading) {
    return renderPage(<h2 className="loading-text" style={{ textAlign: 'center', marginTop: '4rem' }}>Loading issue...</h2>);
  }
  if (!issue) {
    return renderPage(<h2 style={{ textAlign: 'center', marginTop: '4rem' }}>Issue not found.</h2>);
  }

  const tier = difficultyTier(issue.score);
  const suggestedFiles = files.data?.suggested_files || [];

  return renderPage(
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>{issue.title}</h1>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>{issue.repo_name}</p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span className="quest-lang">{issue.language}</span>
          <span className={`quest-difficulty ${tier}`}>Difficulty: {issue.score}/10</span>
        </div>
        <p style={{ marginBottom: '1rem' }}>{issue.summary}</p>
        <a href={issue.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          Open on GitHub
        </a>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn btn-primary"
          disabled={files.loading}
          onClick={() => suggestFiles({ issueId: issue.id })}
        >
          {files.loading ? 'Finding files...' : 'Suggest files to start with'}
        </button>
        {files.error && <p className="text-muted" style={{ marginTop: '1rem' }}>Could not suggest files: {files.error}</p>}
        {files.data && (
          suggestedFiles.length === 0 ? (
            <p className="text-muted" style={{ marginTop: '1rem' }}>No suggestions</p>
          ) : (
            <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
              {suggestedFiles.map((file) => <li key={file}><code>{file}</code></li>)}
            </ul>
          )
        )}
      </div>

      {issue.github_issue_number && (
        <div className="card">
          <button
            className="btn btn-primary"
            disabled={summary.loading}
            onClick={() => summarizeThread({ issueId: issue.id })}
          >
            {summary.loading ? 'Summarizing...' : 'Summarize the thread'}
          </button>
          {summary.error && <p className="text-muted" style={{ marginTop: '1rem' }}>Could not summarize the thread: {summary.error}</p>}
          {summary.data && (
            <ol style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
              {(summary.data.steps || []).map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
