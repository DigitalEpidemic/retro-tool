import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import App from './App.tsx';
import { FirebaseProvider } from './contexts/FirebaseContext.tsx'; // Import the provider
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      {' '}
      {/* Wrap with BrowserRouter */}
      <FirebaseProvider>
        {' '}
        {/* Wrap App with the provider */}
        <App />
      </FirebaseProvider>
    </BrowserRouter>
  </StrictMode>
);
