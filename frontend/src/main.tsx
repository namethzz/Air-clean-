import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// The design system loads before the pages, so a page's own stylesheet can refine a ui-* component.
import './styles/tokens.css';
import './styles/ui.css';
import './styles/shell.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
