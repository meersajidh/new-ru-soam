/**
 * PrefsDevPanel — Phase 10a dev surface that proves the data round-trip.
 *
 * Lists prefs from `prefs.list()` via TanStack Query. Has one key + value
 * input pair driven by `useMutation` calling `prefs.set(...)`. Mutation success
 * does NOT explicitly refetch — the Main process emits `store.changed`, the
 * bridge in `App.tsx` invalidates `['prefs']`, and TanStack refetches
 * automatically. Watching the list update without an explicit refetch call
 * is the success criterion for the change-event pipeline.
 *
 * Opened via the `workbench.developer.openPrefs` command (DEV-only).
 * Rendered as a modal-ish overlay following the existing dialog look.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrefsCapability } from '../../platform/data/use-capability';
import { useModalKeys, Button, Input, FormField } from '@basebench/ui';
import './UnlockGate.css';

interface Props {
  onClose: () => void;
}

export default function PrefsDevPanel({ onClose }: Props) {
  const prefs = usePrefsCapability();
  const queryClient = useQueryClient();

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const list = useQuery({
    queryKey: ['prefs', 'list'] as const,
    queryFn: () => prefs!.list(),
    enabled: prefs !== null,
  });

  const setMutation = useMutation({
    mutationFn: ({ k, v }: { k: string; v: string }) => prefs!.set(k, v),
    // No onSuccess invalidate — the store.changed bridge handles it. That's
    // the whole point of the round-trip demo.
  });

  useModalKeys(onClose);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs || !key) return;
    setMutation.mutate({ k: key, v: value }, {
      onSuccess: () => {
        setKey('');
        setValue('');
      },
    });
  }

  return (
    <div className="unlock-gate-overlay" role="dialog" aria-modal="true">
      <div className="unlock-gate-card w-[520px] max-w-[calc(100vw-32px)]">
        <div className="flex justify-between items-baseline">
          <h2 className="unlock-gate-title">Preferences (dev)</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </Button>
        </div>

        {prefs === null && <p className="t-description">Binding prefs capability…</p>}

        {prefs !== null && (
          <>
            <form className="unlock-gate-form" onSubmit={handleSubmit}>
              <FormField label="Key" htmlFor="pref-key">
                <Input
                  id="pref-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="theme.accent"
                  autoFocus
                />
              </FormField>
              <FormField label="Value" htmlFor="pref-value">
                <Input
                  id="pref-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="bamboo"
                />
              </FormField>
              {setMutation.isError && (
                <p className="unlock-gate-error">
                  Set failed: {setMutation.error instanceof Error ? setMutation.error.message : String(setMutation.error)}
                </p>
              )}
              <div className="setup-actions">
                <Button
                  type="submit"
                  variant="default"
                  disabled={!key || setMutation.isPending}
                >
                  {setMutation.isPending ? 'Saving…' : 'Set pref'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ['prefs'] })}
                >
                  Force refetch
                </Button>
              </div>
            </form>

            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2" style={{ letterSpacing: '0.02em' }}>
                Stored prefs{list.isFetching ? ' (refetching…)' : ''}
              </p>
              {list.isLoading && <p className="t-description">Loading…</p>}
              {list.isError && (
                <p className="unlock-gate-error">
                  List failed: {list.error instanceof Error ? list.error.message : String(list.error)}
                </p>
              )}
              {list.data && list.data.length === 0 && (
                <p className="t-description">No prefs set yet. Add one above.</p>
              )}
              {list.data && list.data.length > 0 && (
                <ul className="list-none p-0 m-0 flex flex-col gap-1">
                  {list.data.map((row) => (
                    <li
                      key={row.key}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2 py-1 px-2 bg-popover rounded-sm font-mono text-xs"
                    >
                      <span>{row.key}</span>
                      <span>{row.value}</span>
                      <span className="opacity-50">
                        {new Date(row.updatedAt).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
