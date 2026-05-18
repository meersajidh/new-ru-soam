import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyInitialTheme } from './platform/theme/themes/initial-theme';
import { applyInitialFontSet } from './platform/font/font-sets/initial-font-set';
import './index.css';
import App from './App.tsx';

applyInitialTheme(document.documentElement);
applyInitialFontSet(document.documentElement);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
