import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';

export const metadata = { title: 'Search' };

export default function SearchPage() {
  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Search' }]} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px calc(var(--player-h) + 48px)' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)', marginBottom: '24px' }}>
            Search.
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
            Search arrives in Phase 2.
          </p>
        </div>
      </div>
      <RightPanel />
      <MiniPlayer demo />
      <BottomNav />
    </>
  );
}
