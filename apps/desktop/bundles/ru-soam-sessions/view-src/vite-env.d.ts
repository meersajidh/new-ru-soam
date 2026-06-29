/// <reference types="vite/client" />

// Ambient module declarations for Vite-handled side-effect asset imports
// (e.g. `import './meetings.css'`). Kept explicit because the bundle tsconfig
// sets `types: []` (no auto-loaded @types), so the vite/client reference above
// is the single source for these decls.
declare module '*.css';
