import type { SlotId } from './slots';

export interface Part {
  readonly id: string;
  readonly slot: SlotId;
  dispose(): void;
}
