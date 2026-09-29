import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './App';
import { useUpdate } from './ui/UpdateBanner';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => useUpdate.setState({ apply: () => void updateSW(true) }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
