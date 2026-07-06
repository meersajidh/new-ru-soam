import { useEffect } from 'react';

export function useModalKeys(onCancel?: () => void): void {
  useEffect(() => {
    if (!onCancel) return;
    function handler(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel!();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);
}
