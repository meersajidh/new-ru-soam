import type { DefaultKeybinding } from './keybinding-service';

/**
 * Platform-default keybindings. Seeded via KeybindingService.seedDefaults()
 * at workbench init; superseded by bundle > user sources (ADR-417).
 */
export const DEFAULT_KEYBINDINGS: ReadonlyArray<DefaultKeybinding> = [
  { key: 'ctrl+b',         command: 'workbench.togglePrimarySideBar' },
  { key: 'ctrl+j',         command: 'workbench.togglePanel' },
  { key: 'ctrl+alt+b',     command: 'workbench.toggleAuxSideBar' },
  { key: 'ctrl+shift+p',   command: 'workbench.openCommandPalette' },
  { key: 'ctrl+\\',        command: 'editors.splitRight' },
  { key: 'ctrl+w',         command: 'editors.closeActive' },
  { key: 'ctrl+tab',       command: 'editors.nextTab' },
  { key: 'ctrl+shift+tab', command: 'editors.previousTab' },
  { key: 'ctrl+shift+l',   command: 'workbench.workspace.relock' },
];
