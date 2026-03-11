import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import Admin from './pages/Admin.tsx';
import Landing from './pages/Landing.tsx';
import './index.css';

const path = window.location.pathname;

const Root = path.startsWith('/admin')
  ? Admin
  : path.startsWith('/shop')
    ? App
    : Landing;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
