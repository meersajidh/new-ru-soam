import type { Part } from './part';
import type { SlotId } from './slots';

export const LAYOUT_SIZE_DEFAULTS = {
  primarySideBarWidth: 240,
  auxSideBarWidth: 240,
  panelHeight: 200,
} as const;

export interface LayoutSizes {
  primarySideBarWidth: number;
  auxSideBarWidth: number;
  panelHeight: number;
}

export interface ILayoutService {
  registerPart(part: Part): void;
  disposePart(id: string): void;
  isVisible(slotId: SlotId): boolean;
  setVisibility(slotId: SlotId, visible: boolean): void;
  toggleVisibility(slotId: SlotId): void;
  getVisibilitySnapshot(): Partial<Record<SlotId, boolean>>;
  restoreVisibility(snapshot: Partial<Record<SlotId, boolean>>): void;
  onDidChangeLayout(listener: () => void): () => void;
  onDidChangePartVisibility(listener: (slotId: SlotId, visible: boolean) => void): () => void;
  // Size API
  getSizes(): LayoutSizes;
  setSize(key: keyof LayoutSizes, value: number): void;
  restoreSizes(sizes: Partial<LayoutSizes>): void;
  onDidChangeSizes(listener: (sizes: LayoutSizes) => void): () => void;
}

export class LayoutService implements ILayoutService {
  private readonly _parts = new Map<string, Part>();
  private readonly _visibility = new Map<SlotId, boolean>();
  private readonly _layoutListeners = new Set<() => void>();
  private readonly _visibilityListeners = new Set<(slotId: SlotId, visible: boolean) => void>();
  private readonly _sizeListeners = new Set<(sizes: LayoutSizes) => void>();
  private _sizes: LayoutSizes = { ...LAYOUT_SIZE_DEFAULTS };

  registerPart(part: Part): void {
    this._parts.set(part.id, part);
    if (!this._visibility.has(part.slot)) {
      this._visibility.set(part.slot, true);
    }
    this._emitLayout();
  }

  disposePart(id: string): void {
    const part = this._parts.get(id);
    if (!part) return;
    part.dispose();
    this._parts.delete(id);
    this._emitLayout();
  }

  isVisible(slotId: SlotId): boolean {
    return this._visibility.get(slotId) ?? true;
  }

  setVisibility(slotId: SlotId, visible: boolean): void {
    if (this._visibility.get(slotId) === visible) return;
    this._visibility.set(slotId, visible);
    this._emitVisibility(slotId, visible);
    this._emitLayout();
  }

  toggleVisibility(slotId: SlotId): void {
    this.setVisibility(slotId, !this.isVisible(slotId));
  }

  getVisibilitySnapshot(): Partial<Record<SlotId, boolean>> {
    return Object.fromEntries(this._visibility) as Partial<Record<SlotId, boolean>>;
  }

  restoreVisibility(snapshot: Partial<Record<SlotId, boolean>>): void {
    for (const [slotId, visible] of Object.entries(snapshot)) {
      if (visible !== undefined) this.setVisibility(slotId as SlotId, visible);
    }
  }

  onDidChangeLayout(listener: () => void): () => void {
    this._layoutListeners.add(listener);
    return () => this._layoutListeners.delete(listener);
  }

  onDidChangePartVisibility(listener: (slotId: SlotId, visible: boolean) => void): () => void {
    this._visibilityListeners.add(listener);
    return () => this._visibilityListeners.delete(listener);
  }

  getSizes(): LayoutSizes {
    return { ...this._sizes };
  }

  setSize(key: keyof LayoutSizes, value: number): void {
    if (this._sizes[key] === value) return;
    this._sizes = { ...this._sizes, [key]: value };
    this._emitSizes();
  }

  restoreSizes(sizes: Partial<LayoutSizes>): void {
    let changed = false;
    for (const k of Object.keys(sizes) as Array<keyof LayoutSizes>) {
      const v = sizes[k];
      if (v !== undefined && this._sizes[k] !== v) {
        this._sizes = { ...this._sizes, [k]: v };
        changed = true;
      }
    }
    if (changed) this._emitSizes();
  }

  onDidChangeSizes(listener: (sizes: LayoutSizes) => void): () => void {
    this._sizeListeners.add(listener);
    return () => this._sizeListeners.delete(listener);
  }

  private _emitLayout(): void {
    for (const l of this._layoutListeners) l();
  }

  private _emitVisibility(slotId: SlotId, visible: boolean): void {
    for (const l of this._visibilityListeners) l(slotId, visible);
  }

  private _emitSizes(): void {
    const snapshot = this.getSizes();
    for (const l of this._sizeListeners) l(snapshot);
  }
}
