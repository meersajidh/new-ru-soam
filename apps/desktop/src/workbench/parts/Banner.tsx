// Banner is hidden by default. auto height means zero content = zero height.
// Phase 3+ will inject banner entries via LayoutService.
export default function Banner() {
  return <div className="part-banner" aria-hidden="true" />;
}
