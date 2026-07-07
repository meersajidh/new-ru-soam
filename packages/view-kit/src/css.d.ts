// Ambient module declaration for side-effect `.css` imports. ViewRoot imports
// `@basebench/ui` (for CSPProvider), which pulls the kit's component source into
// this program; those components do `import './X.css'`. Declared locally so
// view-kit type-checks on its own, mirroring @basebench/ui's own css.d.ts.
declare module '*.css';
