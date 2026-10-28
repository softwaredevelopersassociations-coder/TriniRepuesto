import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import {
  Bike,
  Wrench,
  Store,
  LogOut,
  Calendar,
  LayoutGrid,
  UserCircle,
  MessageSquare,
} from 'lucide-react';

export type DashTab =
  | 'overview'
  | 'motorcycles'
  | 'maintenance'
  | 'marketplace'
  | 'my-parts'
  | 'messages'
  | 'profile';

type NavItem = {
  key: DashTab;
  label: string;
  icon: any;
  badge?: number;
};

export default function DashboardLayout({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: DashTab;
  onTabChange: (tab: DashTab) => void;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const unreadRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIds = useRef<string[] | null>(null);

  const loadUnreadCount = async () => {
    if (!profile) return;

    if (conversationIds.current === null) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`);
      conversationIds.current = (convs || []).map((conversation) => conversation.id);
    }
    const convIds = conversationIds.current;
    if (!convIds || convIds.length === 0) {
      setUnreadCount(0);
      return;
    }

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .neq('sender_id', profile.id)
      .is('read_at', null);

    setUnreadCount(count || 0);
  };

  useEffect(() => {
    if (!profile) {
      setUnreadCount(0);
      return;
    }
    conversationIds.current = null;
    loadUnreadCount();

    const scheduleUnreadRefresh = () => {
      if (unreadRefreshTimer.current) clearTimeout(unreadRefreshTimer.current);
      unreadRefreshTimer.current = setTimeout(() => {
        unreadRefreshTimer.current = null;
        loadUnreadCount();
      }, 250);
    };

    const channel = supabase
      .channel(`unread-badge:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as { sender_id: string };
        if (message.sender_id !== profile.id) scheduleUnreadRefresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as { sender_id: string; read_at: string | null };
        if (message.sender_id !== profile.id && message.read_at) scheduleUnreadRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        conversationIds.current = null;
        scheduleUnreadRefresh();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversations' }, () => {
        conversationIds.current = null;
        scheduleUnreadRefresh();
      })
      .subscribe();

    return () => {
      if (unreadRefreshTimer.current) clearTimeout(unreadRefreshTimer.current);
      unreadRefreshTimer.current = null;
      supabase.removeChannel(channel);
    };
    // Refresh the unread badge when the signed-in user changes, not on every tab navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!profile) return null;

  const showMechanic = profile.role === 'mechanic' || profile.role === 'both';
  const showSeller = profile.role === 'seller' || profile.role === 'both';

  const navItems: NavItem[] = [{ key: 'overview', label: 'Resumen', icon: LayoutGrid }];

  if (showMechanic) {
    navItems.push(
      { key: 'motorcycles', label: 'Mis motos', icon: Bike },
      { key: 'maintenance', label: 'Mantenimiento', icon: Wrench }
    );
  }

  navItems.push({ key: 'marketplace', label: 'Marketplace', icon: Store });

  if (showSeller) {
    navItems.push({ key: 'my-parts', label: 'Mis repuestos', icon: Calendar });
  }

  navItems.push({
    key: 'messages',
    label: 'Mensajes',
    icon: MessageSquare,
    badge: unreadCount,
  });

  navItems.push({ key: 'profile', label: 'Mi perfil', icon: UserCircle });

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 hidden md:flex">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">TriniRepuesto</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                  {item.label}
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => onTabChange('profile')}
            className="flex items-center gap-3 mb-3 w-full text-left hover:bg-slate-800 rounded-lg p-1 -m-1 transition"
          >
            <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold text-slate-200 overflow-hidden shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.full_name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200 truncate">{profile.full_name}</p>
              <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[profile.role]}</p>
            </div>
          </button>
          <button type="button" onClick={signOut} className="btn-ghost w-full text-sm">
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50 flex justify-around p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition relative ${
                active ? 'text-orange-400' : 'text-slate-500'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="p-6 lg:p-8 max-w-6xl mx-auto">
          {/* Mobile header */}
          <div className="md:hidden flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Bike className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">TriniRepuesto</span>
            </div>
            <button type="button" onClick={signOut} className="btn-ghost p-2">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
