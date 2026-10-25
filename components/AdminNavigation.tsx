'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  ChartColumn, CircleHelp, Clapperboard, Database, Ellipsis, ExternalLink, LogOut, Mail, MapPin, Menu,
  Monitor, Music, Palette, Play, Radio, RefreshCw, Server, Sparkles, TreePine, X,
  type LucideIcon,
} from 'lucide-react';
import TimezoneIndicator from './TimezoneIndicator';
import FPPStatusIndicator from './FPPStatusIndicator';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Label in the phone bottom bar; items without one only appear in the sidebar */
  short?: string;
}

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ name: 'Show', href: '/', icon: Play, short: 'Show' }] },
  {
    label: 'Content',
    items: [
      { name: 'Media library', href: '/media', icon: Music },
      { name: 'Videos', href: '/settings/videos', icon: Clapperboard },
      { name: 'Models', href: '/models', icon: TreePine },
      { name: 'Themes', href: '/theme-settings', icon: Palette },
      { name: 'Digital sign', href: '/settings/display', icon: Monitor },
    ],
  },
  {
    label: 'Visitors',
    items: [
      { name: 'Jukebox', href: '/settings/jukebox', icon: Radio, short: 'Jukebox' },
      { name: 'Santa letters', href: '/santa-letters', icon: Mail, short: 'Letters' },
      { name: 'Trivia', href: '/settings/trivia', icon: CircleHelp },
      { name: 'Location limits', href: '/settings/location', icon: MapPin },
    ],
  },
  {
    label: 'Insights',
    items: [{ name: 'Analytics', href: '/analytics', icon: ChartColumn }],
  },
  {
    label: 'System',
    items: [
      { name: 'Devices', href: '/device-status', icon: Server, short: 'Devices' },
      { name: 'Database', href: '/settings/database', icon: Database },
      { name: 'Updates', href: '/settings/updates', icon: RefreshCw },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function initials(name: string | null | undefined) {
  const letters = (name ?? '').split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join('');
  return letters.toUpperCase() || '?';
}

export default function AdminNavigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const current = ALL_ITEMS.find((item) => item.href === pathname);
  const currentGroup = NAV_GROUPS.find((group) => current && group.items.includes(current))?.label;
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {drawerOpen && (
        <button
          aria-label="Close menu"
          onClick={closeDrawer}
          className="fixed inset-0 z-45 bg-black/55 lg:hidden"
        />
      )}

      {/* Sidebar: a slide-out drawer below lg, a sticky column from lg up */}
      <aside
        id="admin-sidebar"
        aria-label="Admin navigation"
        className={`admin-nav fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-0.5 overflow-y-auto border-r border-adm-line bg-adm-side px-3 py-3.5 transition-transform duration-200 ${
          drawerOpen ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-full'
        } lg:visible lg:sticky lg:top-0 lg:z-auto lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-screen lg:w-auto lg:max-w-none lg:translate-x-0 lg:self-start lg:shadow-none`}
      >
        <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-3.5">
          <span className="grid h-7.5 w-7.5 place-items-center rounded-lg bg-adm-accent text-adm-accent-ink">
            <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold text-adm-text">FPP Control Center</span>
          <button
            onClick={closeDrawer}
            aria-label="Close menu"
            className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-adm-line text-adm-text hover:bg-adm-hover lg:hidden"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label ?? 'top'} className="flex flex-col gap-0.5">
            {group.label && (
              <p className="px-2.5 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-faint">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = item === current;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                    active ? 'bg-adm-raised text-white' : 'text-adm-soft hover:bg-adm-hover hover:text-adm-text'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? 'text-adm-accent' : ''}`} aria-hidden="true" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-0.5 border-t border-adm-line pt-3.5">
          <Link
            href="/jukebox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-adm-soft transition-colors hover:bg-adm-hover hover:text-adm-text"
          >
            <ExternalLink className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            Open visitor site
          </Link>
          {session?.user && (
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2A3242] text-[13px] font-semibold text-adm-text">
                {initials(session.user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-adm-text">{session.user.name}</p>
                <p className="text-xs capitalize text-adm-muted">{session.user.role || 'User'}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/jukebox' })}
                aria-label="Sign out"
                title="Sign out"
                className="grid h-10 w-10 place-items-center rounded-lg text-adm-soft hover:bg-adm-hover hover:text-adm-text"
              >
                <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <header className="admin-nav sticky top-0 z-30 flex h-15 items-center gap-3 border-b border-adm-line bg-adm-bg/90 px-3 backdrop-blur sm:px-4 lg:col-start-2 lg:row-start-1 lg:px-7">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="admin-sidebar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-adm-line text-adm-text hover:bg-adm-hover lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {currentGroup && (
            <>
              <span className="hidden text-adm-muted lg:inline">{currentGroup}</span>
              <span className="hidden text-adm-faint lg:inline" aria-hidden="true">/</span>
            </>
          )}
          <span className="truncate font-semibold text-adm-text">{current?.name ?? 'Admin'}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <FPPStatusIndicator />
          <div className="hidden md:block">
            <TimezoneIndicator />
          </div>
          <Link
            href="/jukebox"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-9 items-center gap-1.5 rounded-lg border border-adm-line px-3 text-[13px] font-medium text-adm-text hover:bg-adm-hover md:inline-flex"
          >
            Visitor site
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <nav
        aria-label="Quick navigation"
        className="admin-nav fixed inset-x-0 bottom-0 z-40 flex border-t border-adm-line bg-adm-side pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {ALL_ITEMS.filter((item) => item.short).map((item) => {
          const active = item === current;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? 'text-adm-accent' : 'text-adm-muted'
              }`}
            >
              <Icon className="h-5.5 w-5.5" aria-hidden="true" />
              {item.short}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="More pages"
          aria-expanded={drawerOpen}
          aria-controls="admin-sidebar"
          className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            drawerOpen ? 'text-adm-accent' : 'text-adm-muted'
          }`}
        >
          <Ellipsis className="h-5.5 w-5.5" aria-hidden="true" />
          More
        </button>
      </nav>
    </>
  );
}
