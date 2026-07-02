import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ignorar los errores benignos de WebSocket/Vite HMR en el entorno sandbox
if (typeof window !== 'undefined') {
  const isViteError = (reason: any) => {
    if (!reason) return false;
    const str = String(reason);
    const msg = (reason.message || "").toLowerCase();
    const reasonStr = str.toLowerCase();
    const name = (reason.name || "").toLowerCase();
    const constructorName = (reason.constructor?.name || "").toLowerCase();
    
    if (
      constructorName.includes('websocket') ||
      constructorName.includes('closeevent') ||
      name.includes('websocket') ||
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('hmr') ||
      reasonStr.includes('websocket') ||
      reasonStr.includes('vite') ||
      reasonStr.includes('hmr') ||
      reasonStr.includes('closeevent') ||
      (reason instanceof Event && (reason.type === 'close' || reason.type === 'error'))
    ) {
      return true;
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    if (event.message && isViteError(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isViteError(event.reason) || isViteError(event.reason?.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

