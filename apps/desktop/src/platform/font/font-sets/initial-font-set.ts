// Called synchronously in main.tsx before createRoot.render to set the default
// font set without flash. Applies font-set-ru-display if no font-set-* class
// is already present on the root element (i.e. first cold-start; applyInitialTheme
// will override from localStorage if the user has previously chosen a different set).
export function applyInitialFontSet(root: HTMLElement): void {
  const hasFontSet = Array.from(root.classList).some((cls) => cls.startsWith('font-set-'));
  if (!hasFontSet) {
    root.classList.add('font-set-ru-display');
  }
}
