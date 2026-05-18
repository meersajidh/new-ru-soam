import { useContextKey } from '../../platform/services/hooks';

export type WorkbenchMode = 'setup' | 'locked' | 'workspace';

export function useWorkbenchMode(): WorkbenchMode {
  const activeId = useContextKey('workspace.activeId') as string | undefined;
  const setupComplete = useContextKey('workspace.setupComplete') as boolean | undefined;
  const kekLocked = useContextKey('workspace.kekLocked') as boolean | undefined;

  if (!activeId || !setupComplete) return 'setup';
  if (kekLocked) return 'locked';
  return 'workspace';
}
