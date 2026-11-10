import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { NoticeProvider } from './components/ui/Notice';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AiServerPage } from './pages/systems/AiServerPage';
import { ShellyPlugPage } from './pages/systems/ShellyPlugPage';
import { AgentsPage } from './pages/AgentsPage';
import { LlmPage } from './pages/LlmPage';
import { ConfigOverviewPage, ConfigSectionPage } from './pages/config/ConfigPages';
import { ConfigSystemsPage } from './pages/config/ConfigSystemsPage';
import { ConfigMiraPage } from './pages/config/ConfigMiraPage';
import { features } from './lib/features';

export function App() {
  return (
    <NoticeProvider>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/systeme" element={<Navigate to="/systeme/ki-server" replace />} />
            <Route path="/systeme/ki-server" element={<AiServerPage />} />
            {/* Übergang (Stufe 3a): alte Lesezeichen – entfällt mit dem Aufräumen nach der Umstellung */}
            <Route path="/systeme/odin" element={<Navigate to="/systeme/ki-server" replace />} />
            <Route path="/systeme/shelly-plug" element={<ShellyPlugPage />} />
            {features.agents && <Route path="/agents" element={<AgentsPage />} />}
            <Route path="/llm" element={<LlmPage />} />
            <Route path="/konfiguration" element={<ConfigOverviewPage />} />
            <Route path="/konfiguration/systeme" element={<ConfigSystemsPage />} />
            <Route path="/konfiguration/mira" element={<ConfigMiraPage />} />
            <Route path="/konfiguration/:section" element={<ConfigSectionPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </NoticeProvider>
  );
}
