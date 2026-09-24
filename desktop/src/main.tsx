import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/app/tokens.css';
import './styles/desktop.css';
import { App } from './App';
import { DesktopI18nProvider } from './i18n';

createRoot(document.getElementById('root')!).render(<StrictMode><DesktopI18nProvider><App /></DesktopI18nProvider></StrictMode>);
