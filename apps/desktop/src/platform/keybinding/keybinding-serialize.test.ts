import { describe, expect, it } from 'vitest';
import { chordFromEvent, isModifierEvent } from './keybinding-service';

// Tier-1 (B1) coverage of the pure keybinding-serialization helpers: turning a
// KeyboardEvent into a canonical chord string, and detecting lone-modifier
// presses. Both read only event fields, so a plain cast object suffices — no DOM.

function ev(part: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...part } as KeyboardEvent;
}

describe('chordFromEvent', () => {
  it('serializes a plain modified key', () => {
    expect(chordFromEvent(ev({ key: 'p', ctrlKey: true }))).toBe('ctrl+p');
  });

  it('lowercases the key and emits modifiers in canonical ctrl→meta→alt→shift order', () => {
    // Event reports shift+ctrl; output must be canonical ctrl+shift regardless.
    expect(chordFromEvent(ev({ key: 'P', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+p');
  });

  it('emits all four modifiers in fixed order', () => {
    const chord = chordFromEvent(
      ev({ key: 'x', ctrlKey: true, metaKey: true, altKey: true, shiftKey: true }),
    );
    expect(chord).toBe('ctrl+meta+alt+shift+x');
  });

  it('maps arrow keys and space to their aliases', () => {
    expect(chordFromEvent(ev({ key: 'ArrowUp' }))).toBe('up');
    expect(chordFromEvent(ev({ key: 'ArrowLeft', altKey: true }))).toBe('alt+left');
    expect(chordFromEvent(ev({ key: ' ' }))).toBe('space');
  });

  it('passes punctuation keys through', () => {
    expect(chordFromEvent(ev({ key: ',', ctrlKey: true }))).toBe('ctrl+,');
  });
});

describe('isModifierEvent', () => {
  it('is true for lone modifier presses', () => {
    expect(isModifierEvent(ev({ key: 'Control' }))).toBe(true);
    expect(isModifierEvent(ev({ key: 'Shift' }))).toBe(true);
    expect(isModifierEvent(ev({ key: 'Meta' }))).toBe(true);
    expect(isModifierEvent(ev({ key: 'Alt' }))).toBe(true);
  });

  it('is false for real keys', () => {
    expect(isModifierEvent(ev({ key: 'a' }))).toBe(false);
    expect(isModifierEvent(ev({ key: 'Enter' }))).toBe(false);
  });
});
