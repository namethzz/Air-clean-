import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// The design system loads before the pages, so a page's own stylesheet can refine a ui-* component.
import './styles/tokens.css';
import './styles/ui.css';
import './styles/shell.css';
import App from './App';

// Pages are loaded as separate files. After a new release the old files are gone, so a tab opened before it cannot
// fetch the page it asks for: load the new release once instead of showing a blank screen.
window.addEventListener('vite:preloadError', event => {
  const key = 'airclean.reloadedFor';
  const failed = String((event as Event & { payload?: unknown }).payload ?? '');
  try { if (sessionStorage.getItem(key) === failed) return; sessionStorage.setItem(key, failed); } catch { /* storage blocked */ }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
