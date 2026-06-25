"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';

export default function LandingPage() {
  return (
    <>
      <GlobalHeader 
        showSearch={false}
      />

      <div className="layout-container" style={{ padding: 0, maxWidth: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Clean Hero Section */}
        <section style={{ 
          width: '100%', 
          padding: '100px 24px 60px',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'var(--bg-color)',
          color: 'var(--text-main)'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '800px' }}>
            <h1 style={{ fontSize: '3.5rem', fontWeight: 700, marginBottom: '24px', letterSpacing: '-0.04em', lineHeight: 1.2 }}>
              Find open source issues and start your open source journey.
            </h1>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '40px', lineHeight: 1.6 }}>
              SmartTriageHub uses advanced AI to evaluate, score, and gamify open-source issues. Level up your developer profile by solving the bugs that matter most.
            </p>
            <Link href="/board" className="btn btn-primary" style={{ fontSize: '1.25rem', padding: '16px 32px', borderRadius: '8px' }}>
              Start Picking Issues
            </Link>
          </div>
        </section>

        {/* Minimalist Feature Cards (Sticky Notes Style) */}
        <section style={{ maxWidth: '1012px', margin: '0 auto', padding: '40px 24px 100px', width: '100%' }}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            
            {/* Left Card: AI Triage */}
            <div className="card" style={{ flex: 1, minWidth: '300px', padding: '32px', borderTop: '4px solid var(--accent-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '16px' }}>AI-Powered Triage</h2>
              <p className="text-muted" style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                Every incoming GitHub issue is instantly analyzed by Gemini AI. It automatically assesses complexity, assigns a difficulty score, and writes a crisp summary so you know exactly what you're getting into before you claim it.
              </p>
            </div>

            {/* Right Card: Gamification */}
            <div className="card" style={{ flex: 1, minWidth: '300px', padding: '32px', borderTop: '4px solid var(--difficulty-easy)', backgroundColor: 'var(--bg-secondary)' }}>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '16px' }}>Gamified Development</h2>
              <p className="text-muted" style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                Your contributions actually mean something. Earn XP for every merged pull request based on the AI difficulty score. Level up, unlock your crown, and build an indisputable profile of open-source impact.
              </p>
            </div>

          </div>
        </section>

      </div>

      <GlobalFooter />
    </>
  );
}
