// Called synchronously in main.tsx before createRoot.render to set the default
// font set without flash. ADR-421 F1: font-set axis folded into base-luma;
// applies font-set-base-luma if no font-set-* class is already present.
export function applyInitialFontSet(root: HTMLElement): void {
  const hasFontSet = Array.from(root.classList).some((cls) => cls.startsWith('font-set-'));
  if (!hasFontSet) {
    root.classList.add('font-set-base-luma');
  }
}
