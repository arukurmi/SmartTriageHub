"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';

/** ThemeProvider remounts its children once and StrictMode re-runs effects; a second exchange of one code fails. */
const exchangesByCode = new Map();

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const failureReason =
      params.get('error_description') || params.get('error') || (!code && 'no authorization code was returned');

    if (!failureReason && !exchangesByCode.has(code)) {
      exchangesByCode.set(code, supabase.auth.exchangeCodeForSession(code).catch((error) => ({ error })));
    }
    const outcome = failureReason ? Promise.resolve({ error: { message: failureReason } }) : exchangesByCode.get(code);
    let isCurrentMount = true;
    outcome.then(({ error }) => {
      if (!isCurrentMount) return;
      if (error) setErrorMessage(`GitHub sign-in failed: ${error.message}`);
      else router.replace('/board');
    });
    return () => {
      isCurrentMount = false;
    };
  }, [router]);

  return (
    <>
      <GlobalHeader showSearch={false} />
      <div className="layout-container auth-container" style={{ textAlign: 'center' }}>
        {errorMessage ? (
          <>
            <h2>{errorMessage}</h2>
            <Link href="/board" className="btn btn-primary" style={{ marginTop: '1rem' }}>Back to sign in</Link>
          </>
        ) : (
          <h2 className="loading-text">Signing you in...</h2>
        )}
      </div>
      <GlobalFooter />
    </>
  );
}
