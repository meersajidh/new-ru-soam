export const SlotId = {
  TitleBar: 'titlebar',
  Banner: 'banner',
  ActivityBar: 'activitybar',
  PrimarySideBar: 'primarysidebar',
  EditorArea: 'editorarea',
  AuxSideBar: 'auxsidebar',
  Panel: 'panel',
  StatusBar: 'statusbar',
} as const;

export type SlotId = (typeof SlotId)[keyof typeof SlotId];
