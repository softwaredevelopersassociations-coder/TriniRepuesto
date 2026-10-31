import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/AuthScreen';
import DashboardLayout, { type DashTab } from '@/components/DashboardLayout';
import Overview from '@/components/Overview';
import MotorcyclesView from '@/components/MotorcyclesView';
import MaintenanceView from '@/components/MaintenanceView';
import MarketplaceView from '@/components/MarketplaceView';
import MyPartsView from '@/components/MyPartsView';
import MessagesView from '@/components/MessagesView';
import ProfileView from '@/components/ProfileView';
import AuthBackdrop from '@/components/AuthBackdrop';
import LoadingAnimation from '@/components/LoadingAnimation';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashTab>('overview');

  if (loading) {
    return (
      <div className="auth-loading-screen relative isolate min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 p-6">
        <AuthBackdrop />
        <div className="relative z-10 rounded-3xl border border-white/10 bg-slate-950/75 px-10 py-8 shadow-2xl backdrop-blur-2xl">
          <LoadingAnimation label="Preparando tu espacio…" />
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  const showClient = profile.role === 'client';
  const showSeller = profile.role === 'seller';

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'motorcycles':
        return showClient ? <MotorcyclesView /> : <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'maintenance':
        return showClient ? <MaintenanceView /> : <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'marketplace':
        return <MarketplaceView onNavigate={(tab) => setActiveTab(tab as DashTab)} />;
      case 'my-parts':
        return showSeller ? <MyPartsView /> : <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'messages':
        return <MessagesView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
    }
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderTab()}
    </DashboardLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
