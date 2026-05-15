import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyInitialTheme } from './platform/theme/themes/initial-theme';
import './index.css';
import App from './App.tsx';

applyInitialTheme(document.documentElement);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
