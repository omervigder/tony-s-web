import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App.tsx'));
const Admin = lazy(() => import('./pages/Admin.tsx'));
const Landing = lazy(() => import('./pages/Landing.tsx'));

const path = window.location.pathname;

const Root = path.startsWith('/admin')
  ? Admin
  : path.startsWith('/shop')
    ? App
    : Landing;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
