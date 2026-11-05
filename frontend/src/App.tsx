import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { NoticeProvider } from './components/ui/Notice';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { OdinPage } from './pages/systems/OdinPage';
import { ShellyPlugPage } from './pages/systems/ShellyPlugPage';
import { AgentsPage } from './pages/AgentsPage';
import { LlmPage } from './pages/LlmPage';
import { ConfigOverviewPage, ConfigSectionPage } from './pages/config/ConfigPages';
import { ConfigSystemsPage } from './pages/config/ConfigSystemsPage';

export function App() {
  return (
    <NoticeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/systeme" element={<Navigate to="/systeme/odin" replace />} />
            <Route path="/systeme/odin" element={<OdinPage />} />
            <Route path="/systeme/shelly-plug" element={<ShellyPlugPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/llm" element={<LlmPage />} />
            <Route path="/konfiguration" element={<ConfigOverviewPage />} />
            <Route path="/konfiguration/systeme" element={<ConfigSystemsPage />} />
            <Route path="/konfiguration/:section" element={<ConfigSectionPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </NoticeProvider>
  );
}
