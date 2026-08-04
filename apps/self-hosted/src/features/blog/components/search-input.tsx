'use client';

import { UilSearch, UilTimes } from '@tooni/iconscout-unicons-react';
import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { InstanceConfigManager, t } from '@/core';

export function SearchInput() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const isSearchEnabled = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.layout.search?.enabled ?? false,
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        navigate({
          to: '/search',
          search: { q: query.trim() },
        });
        setIsExpanded(false);
      }
    },
    [query, navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setQuery('');
      }
    },
    [],
  );

  if (!isSearchEnabled) {
    return null;
  }

  return (
    <div className="relative flex items-center">
      {isExpanded ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search')}
            autoFocus
            className={clsx(
              'w-40 sm:w-56 px-3 py-1.5 text-sm rounded-md',
              'border border-theme bg-theme text-theme-primary',
              'placeholder:text-theme-muted',
              'focus:outline-none focus:ring-2 focus:ring-theme-accent',
            )}
          />
          <button
            type="button"
            onClick={() => {
              setIsExpanded(false);
              setQuery('');
            }}
            className="p-1 text-theme-muted hover:text-theme-primary transition-colors"
            aria-label="Close search"
          >
            <UilTimes className="size-5" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="p-2 text-theme-muted hover:text-theme-primary transition-colors"
          aria-label="Open search"
        >
          <UilSearch className="size-5" />
        </button>
      )}
    </div>
  );
}
