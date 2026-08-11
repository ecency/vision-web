import { memo, useCallback, useEffect, useState } from 'react';
import { t } from '@/core';
import { useCurrentUser } from '@/features/auth/hooks';
import {
  clearSetupPending,
  hasSeenFirstRun,
  isSetupPending,
  markFirstRunSeen,
} from '@/features/auth/setup-handoff';
import { FloatingMenuButton } from './floating-menu-button';
import { FloatingMenuWindow } from './floating-menu-window';

interface FloatingMenuProps {
  show?: boolean;
}

export const FloatingMenu = memo<FloatingMenuProps>(({ show = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Rendered for the instance owner only (AuthorizedFloatingMenu gates on
  // ownership), so the account here is the owner's.
  const user = useCurrentUser();
  const account = user?.username ?? '';
  const [showFirstRun, setShowFirstRun] = useState(false);

  // The signup success screen hands the owner over with a pending setup
  // intent (sessionStorage, surviving the OAuth round trip): open the panel
  // without another hunt for the settings button. Otherwise, a first visit as
  // owner gets a one-time checklist pointing at it.
  useEffect(() => {
    if (!account) return;
    if (isSetupPending()) {
      clearSetupPending();
      markFirstRunSeen(account);
      setIsOpen(true);
      setShowFirstRun(false);
      return;
    }
    setShowFirstRun(!hasSeenFirstRun(account));
  }, [account]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const dismissFirstRun = useCallback(() => {
    if (account) markFirstRunSeen(account);
    setShowFirstRun(false);
  }, [account]);

  const openFromFirstRun = useCallback(() => {
    dismissFirstRun();
    setIsOpen(true);
  }, [dismissFirstRun]);

  if (!show) return null;

  return (
    <>
      {showFirstRun && !isOpen && (
        <div className="fixed bottom-20 right-4 z-40 max-w-xs rounded-lg border border-theme bg-theme-secondary shadow-theme-lg p-4 text-sm">
          <div className="font-semibold mb-2">{t('first_run_title')}</div>
          <ul className="list-disc list-inside flex flex-col gap-1 text-theme-muted mb-3">
            <li>{t('first_run_item_theme')}</li>
            <li>{t('first_run_item_accent')}</li>
            <li>{t('first_run_item_title')}</li>
          </ul>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openFromFirstRun}
              className="px-3 py-1.5 rounded-lg bg-black text-white hover:bg-black/80 font-medium"
            >
              {t('first_run_open')}
            </button>
            <button
              type="button"
              onClick={dismissFirstRun}
              className="text-theme-muted underline hover:no-underline"
            >
              {t('first_run_dismiss')}
            </button>
          </div>
        </div>
      )}
      <FloatingMenuButton onClick={handleToggle} isOpen={isOpen} />
      <FloatingMenuWindow isOpen={isOpen} onClose={handleClose} />
    </>
  );
});

FloatingMenu.displayName = 'FloatingMenu';
