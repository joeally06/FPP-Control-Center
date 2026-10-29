import { LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import { ADMIN_BUTTON, BAR_BUTTON } from './admin-buttons';

interface RadioBarAdminSlotProps {
  signedIn: boolean;
  isAdmin: boolean;
  /** Shown as a tooltip on the log-out button */
  userName?: string | null;
  onSignIn: () => void;
  onOpenDashboard: () => void;
  onSignOut: () => void;
}

/** The admin sign-in / dashboard / log-out buttons at the end of the radio bar. */
export default function RadioBarAdminSlot({ signedIn, isAdmin, userName, onSignIn, onOpenDashboard, onSignOut }: RadioBarAdminSlotProps) {
  // Icon-only on phones so the bar fits on one line; words from the sm breakpoint up
  if (!signedIn) {
    return (
      <button type="button" onClick={onSignIn} aria-label="Admin sign in" className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-white/10 hover:bg-white/20`}>
        <LogIn className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">Admin</span>
      </button>
    );
  }

  return (
    <>
      {isAdmin && (
        <button type="button" onClick={onOpenDashboard} aria-label="Dashboard" className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-blue-600 hover:bg-blue-500`}>
          <LayoutDashboard className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
      )}
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Log out"
        title={userName ? `Signed in as ${userName}` : undefined}
        className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-white/10 hover:bg-white/20`}
      >
        <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">Log out</span>
      </button>
    </>
  );
}
