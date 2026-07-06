// Ambient module declaration for side-effect `.css` imports (e.g. `import
// './Button.css'`). apps/desktop gets this from `vite/client`'s ambient types
// (tsconfig.app.json `"types": ["vite/client"]`); @basebench/ui declares it
// locally so the package type-checks on its own, independent of how a
// consumer's tsconfig or language-server project resolves `vite/client`.
declare module '*.css';
