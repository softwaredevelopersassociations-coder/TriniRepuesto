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
import { Bike } from 'lucide-react';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashTab>('overview');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center animate-pulse-ring">
            <Bike className="w-7 h-7 text-white" />
          </div>
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  const showMechanic = profile.role === 'mechanic' || profile.role === 'both';
  const showSeller = profile.role === 'seller' || profile.role === 'both';

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'motorcycles':
        return showMechanic ? <MotorcyclesView /> : <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'maintenance':
        return showMechanic ? <MaintenanceView /> : <Overview onNavigate={(t) => setActiveTab(t as DashTab)} />;
      case 'marketplace':
        return <MarketplaceView />;
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
