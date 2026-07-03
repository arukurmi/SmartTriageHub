"use client";

import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';
import GithubActivityList from '@/components/GithubActivityList';

export default function MyPullRequestsPage() {
  return (
    <>
      <GlobalHeader showSearch={false} />
      <div className="layout-container" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <GithubActivityList type="pr" />
      </div>
      <GlobalFooter />
    </>
  );
}
