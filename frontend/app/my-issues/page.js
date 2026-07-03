"use client";

import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';
import GithubActivityList from '@/components/GithubActivityList';

export default function MyIssuesPage() {
  return (
    <>
      <GlobalHeader showSearch={false} />
      <div className="layout-container" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <GithubActivityList type="issue" />
      </div>
      <GlobalFooter />
    </>
  );
}
