import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const App           = lazy(() => import('./App.tsx'));
const Admin         = lazy(() => import('./pages/Admin.tsx'));
const Accessibility = lazy(() => import('./pages/Accessibility.tsx'));
const Terms         = lazy(() => import('./pages/Terms.tsx'));
const Privacy       = lazy(() => import('./pages/Privacy.tsx'));
const Shipping      = lazy(() => import('./pages/Shipping.tsx'));

const path = window.location.pathname;

// The shop (App) is the homepage. '/', '/checkout', '/success', '/product/*',
// '/build-box' and any other path fall through to it; only the pages below opt out.
const Root = path.startsWith('/admin')         ? Admin
           : path.startsWith('/accessibility') ? Accessibility
           : path.startsWith('/terms')         ? Terms
           : path.startsWith('/privacy')       ? Privacy
           : path.startsWith('/shipping')      ? Shipping
           : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
