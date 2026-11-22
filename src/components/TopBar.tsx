import { RefreshCw } from 'lucide-react';

export type NavTab = 'globe' | 'alerts' | 'trends' | 'method';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastRefreshUtc: string | null;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'globe', label: 'Globe' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'trends', label: 'Trends' },
  { id: 'method', label: 'Method' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onRefresh,
  isRefreshing,
}: TopBarProps) {
  return (
    <header
      className="no-print relative z-30 flex items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 h-14 border-b shrink-0"
      style={{
        background:
          'linear-gradient(180deg, rgba(16, 56, 78, 0.62) 0%, rgba(4, 18, 31, 0.72) 100%)',
        borderColor: 'rgba(206, 244, 248, 0.20)',
        backdropFilter: 'blur(20px) saturate(170%)',
        WebkitBackdropFilter: 'blur(20px) saturate(170%)',
        boxShadow: 'inset 0 -1px 0 rgba(236, 250, 252, 0.08), 0 8px 24px -12px rgba(1, 8, 16, 0.7)',
      }}
    >
      {/* Zone 1: Single-line Wordmark */}
      <a
        href="#globe"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('globe');
        }}
        className="font-display text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap shrink-0"
        style={{ color: 'var(--text-primary)' }}
      >
        Nereus
      </a>

      {/* Zone 2: Clean single-line navigation links */}
      <nav aria-label="Primary navigation" className="flex items-center gap-3 sm:gap-7">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className="py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderColor: active ? 'var(--accent-coral)' : 'transparent',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="nereus-btn-primary inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="sm:hidden">{isRefreshing ? 'Sync' : 'Sync'}</span>
          <span className="hidden sm:inline">{isRefreshing ? 'Syncing' : 'Refresh Data'}</span>
        </button>
      </div>
    </header>
  );
}
