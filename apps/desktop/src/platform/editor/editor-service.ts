export type EditorLayoutNode =
  | { kind: 'group'; groupId: string }
  | { kind: 'split'; direction: 'horizontal' | 'vertical'; ratio: number; first: EditorLayoutNode; second: EditorLayoutNode };

export interface EditorInstance {
  id: string;
  resource: string;
  title: string;
  isDirty: boolean;
}

export interface EditorGroup {
  id: string;
  tabs: EditorInstance[];
  activeTabId: string | null;
}

export interface IEditorService {
  open(resource: string, options?: { groupId?: string; title?: string }): string;
  close(instanceId: string): void;
  splitGroup(groupId: string, direction: 'horizontal' | 'vertical'): string;
  moveTab(instanceId: string, targetGroupId: string): void;
  setActiveTab(groupId: string, instanceId: string): void;
  getLayout(): EditorLayoutNode;
  getGroup(groupId: string): EditorGroup | undefined;
  getGroups(): EditorGroup[];
  getFocusedGroupId(): string | null;
  setFocusedGroup(groupId: string): void;
  onDidChange(listener: () => void): () => void;
}

export class EditorService implements IEditorService {
  private readonly _groups = new Map<string, EditorGroup>();
  private _layout: EditorLayoutNode;
  private _focusedGroupId: string | null;
  private _groupCounter = 0;
  private _instanceCounter = 0;
  private readonly _listeners = new Set<() => void>();

  constructor() {
    const id = this._nextGroupId();
    this._groups.set(id, { id, tabs: [], activeTabId: null });
    this._layout = { kind: 'group', groupId: id };
    this._focusedGroupId = id;
  }

  open(resource: string, options?: { groupId?: string; title?: string }): string {
    const targetId = options?.groupId ?? this._focusedGroupId ?? this._firstGroupId();
    const group = this._groups.get(targetId);
    if (!group) throw new Error(`Group ${targetId} not found`);

    const existing = group.tabs.find(t => t.resource === resource);
    if (existing) {
      this._groups.set(targetId, { ...group, activeTabId: existing.id });
      this._focusedGroupId = targetId;
      this._emit();
      return existing.id;
    }

    const id = `instance-${++this._instanceCounter}`;
    const title = options?.title ?? this._titleFromResource(resource);
    this._groups.set(targetId, { ...group, tabs: [...group.tabs, { id, resource, title, isDirty: false }], activeTabId: id });
    this._focusedGroupId = targetId;
    this._emit();
    return id;
  }

  close(instanceId: string): void {
    const groupId = this._findGroupContaining(instanceId);
    if (!groupId) return;
    if (!this._removeTabFromGroup(groupId, instanceId)) return;
    this._emit();
  }

  splitGroup(groupId: string, direction: 'horizontal' | 'vertical'): string {
    const newId = this._nextGroupId();
    this._groups.set(newId, { id: newId, tabs: [], activeTabId: null });
    this._layout = this._insertSplit(this._layout, groupId, newId, direction);
    this._focusedGroupId = newId;
    this._emit();
    return newId;
  }

  moveTab(instanceId: string, targetGroupId: string): void {
    const targetGroup = this._groups.get(targetGroupId);
    if (!targetGroup) return;
    const sourceGroupId = this._findGroupContaining(instanceId);
    if (!sourceGroupId || sourceGroupId === targetGroupId) return;

    const result = this._removeTabFromGroup(sourceGroupId, instanceId);
    if (!result) return;

    const target = this._groups.get(targetGroupId);
    if (!target) return;
    this._groups.set(targetGroupId, {
      ...target,
      tabs: [...target.tabs, result.instance],
      activeTabId: result.instance.id,
    });
    this._focusedGroupId = targetGroupId;
    this._emit();
  }

  setActiveTab(groupId: string, instanceId: string): void {
    const group = this._groups.get(groupId);
    if (!group) return;
    if (!group.tabs.some(t => t.id === instanceId)) return;
    if (group.activeTabId === instanceId && this._focusedGroupId === groupId) return;
    this._groups.set(groupId, { ...group, activeTabId: instanceId });
    this._focusedGroupId = groupId;
    this._emit();
  }

  getLayout(): EditorLayoutNode { return this._layout; }
  getGroup(groupId: string): EditorGroup | undefined { return this._groups.get(groupId); }
  getGroups(): EditorGroup[] { return Array.from(this._groups.values()); }
  getFocusedGroupId(): string | null { return this._focusedGroupId; }

  setFocusedGroup(groupId: string): void {
    if (this._groups.has(groupId)) { this._focusedGroupId = groupId; this._emit(); }
  }

  onDidChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _emit(): void { for (const l of [...this._listeners]) l(); }
  private _nextGroupId(): string { return `group-${++this._groupCounter}`; }
  private _firstGroupId(): string { return this._groups.keys().next().value as string; }
  private _otherGroupId(exclude: string): string | undefined {
    for (const id of this._groups.keys()) if (id !== exclude) return id;
    return undefined;
  }

  private _findGroupContaining(instanceId: string): string | undefined {
    for (const [id, group] of this._groups) {
      if (group.tabs.some(t => t.id === instanceId)) return id;
    }
    return undefined;
  }

  private _removeTabFromGroup(groupId: string, instanceId: string): { instance: EditorInstance; collapsed: boolean } | undefined {
    const group = this._groups.get(groupId);
    if (!group) return undefined;
    const idx = group.tabs.findIndex(t => t.id === instanceId);
    if (idx === -1) return undefined;

    const instance = group.tabs[idx];
    const newTabs = group.tabs.filter(t => t.id !== instanceId);
    const newActive = group.activeTabId === instanceId
      ? (newTabs[idx]?.id ?? newTabs[idx - 1]?.id ?? null)
      : group.activeTabId;

    if (newTabs.length === 0 && this._groups.size > 1) {
      const remaining = this._otherGroupId(groupId) ?? this._firstGroupId();
      if (this._focusedGroupId === groupId) this._focusedGroupId = remaining;
      this._groups.delete(groupId);
      this._layout = this._removeNode(this._layout, groupId) ?? { kind: 'group', groupId: remaining };
      return { instance, collapsed: true };
    }

    this._groups.set(groupId, { ...group, tabs: newTabs, activeTabId: newActive });
    return { instance, collapsed: false };
  }

  private _titleFromResource(resource: string): string {
    try {
      const url = new URL(resource);
      if (url.protocol === 'placeholder:') return 'New Tab';
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] ?? resource;
    } catch {
      return resource;
    }
  }

  private _insertSplit(node: EditorLayoutNode, groupId: string, newGroupId: string, dir: 'horizontal' | 'vertical'): EditorLayoutNode {
    if (node.kind === 'group' && node.groupId === groupId) {
      return { kind: 'split', direction: dir, ratio: 0.5, first: node, second: { kind: 'group', groupId: newGroupId } };
    }
    if (node.kind === 'split') {
      return { ...node, first: this._insertSplit(node.first, groupId, newGroupId, dir), second: this._insertSplit(node.second, groupId, newGroupId, dir) };
    }
    return node;
  }

  private _removeNode(node: EditorLayoutNode, groupId: string): EditorLayoutNode | null {
    if (node.kind === 'group') return node.groupId === groupId ? null : node;
    const first = this._removeNode(node.first, groupId);
    const second = this._removeNode(node.second, groupId);
    if (first === null) return second;
    if (second === null) return first;
    return { ...node, first, second };
  }
}
