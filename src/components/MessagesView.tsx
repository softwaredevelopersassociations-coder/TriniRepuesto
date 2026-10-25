import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Part } from '@/types';
import { MessageSquare, Package, Store, User } from 'lucide-react';
import ChatModal from './ChatModal';

const CONVERSATIONS_PAGE_SIZE = 50;

type ConvRow = {
  id: string;
  part_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
};

type ConvEnriched = {
  id: string;
  part_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  part: Pick<Part, 'id' | 'title' | 'image_url' | 'price'> | null;
  other_user: { id: string; full_name: string; avatar_url: string | null } | null;
  unread_count: number;
};

export default function MessagesView() {
  const { profile } = useAuth();
  const [convs, setConvs] = useState<ConvEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlderConversations, setLoadingOlderConversations] = useState(false);
  const [hasOlderConversations, setHasOlderConversations] = useState(false);
  const [activeConv, setActiveConv] = useState<ConvEnriched | null>(null);
  const activeConvId = useRef<string | null>(null);

  const load = async (offset = 0) => {
    if (!profile) return;
    if (offset === 0) setLoading(true);
    else setLoadingOlderConversations(true);

    const { data: rawConvs } = await supabase
      .from('conversations')
      .select('id,part_id,buyer_id,seller_id,created_at,last_message_at')
      .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + CONVERSATIONS_PAGE_SIZE - 1);

    if (!rawConvs || rawConvs.length === 0) {
      if (offset === 0) setConvs([]);
      setHasOlderConversations(false);
      setLoading(false);
      setLoadingOlderConversations(false);
      return;
    }
    setHasOlderConversations(rawConvs.length === CONVERSATIONS_PAGE_SIZE);

    const partIds = [...new Set(rawConvs.map((c: ConvRow) => c.part_id))];
    const otherUserIds = rawConvs.map((c: ConvRow) =>
      c.buyer_id === profile.id ? c.seller_id : c.buyer_id
    );
    const uniqueOtherIds = [...new Set(otherUserIds)];

    const [{ data: partsData }, { data: usersData }] = await Promise.all([
      supabase.from('parts').select('id,title,image_url,price').in('id', partIds),
      supabase.from('profiles').select('id,full_name,avatar_url,business_name').in('id', uniqueOtherIds),
    ]);

    const convIds = rawConvs.map((c: ConvRow) => c.id);
    const { data: unreadData } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', profile.id)
      .is('read_at', null)
      .limit(500);

    const unreadMap: Record<string, number> = {};
    (unreadData || []).forEach((m: { conversation_id: string }) => {
      unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1;
    });

    const partsMap: Record<string, any> = {};
    (partsData || []).forEach((p: any) => {
      partsMap[p.id] = p;
    });
    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => {
      usersMap[u.id] = { ...u, full_name: u.business_name || u.full_name };
    });

    const enriched: ConvEnriched[] = rawConvs.map((c: ConvRow) => ({
      id: c.id,
      part_id: c.part_id,
      buyer_id: c.buyer_id,
      seller_id: c.seller_id,
      last_message_at: c.last_message_at,
      part: partsMap[c.part_id] ?? null,
      other_user: usersMap[c.buyer_id === profile.id ? c.seller_id : c.buyer_id] ?? null,
      unread_count: unreadMap[c.id] ?? 0,
    }));

    setConvs((current) => {
      const combined = offset === 0 ? enriched : [...current, ...enriched];
      return [...new Map(combined.map((conversation) => [conversation.id, conversation])).values()]
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
    });
    setLoading(false);
    setLoadingOlderConversations(false);
  };

  useEffect(() => {
    if (!profile) return;
    load();

    const channel = supabase
      .channel(`messages-view:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as { conversation_id: string; sender_id: string; created_at: string };
        setConvs((current) => current
          .map((conversation) => conversation.id === message.conversation_id
            ? {
                ...conversation,
                last_message_at: message.created_at,
                unread_count: message.sender_id !== profile.id && activeConvId.current !== message.conversation_id
                  ? conversation.unread_count + 1
                  : conversation.unread_count,
              }
            : conversation)
          .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // load is intentionally called once when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fmt = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (diffH < 168) return d.toLocaleDateString('es', { weekday: 'short' });
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Mensajes</h1>
        <p className="text-slate-400 text-sm">Conversaciones con vendedores y compradores</p>
      </div>

      {convs.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">No tienes mensajes aún</p>
          <p className="text-slate-500 text-sm mt-1">Contacta a un vendedor desde el Marketplace</p>
        </div>
      ) : (
        <div className="space-y-2">
          {convs.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                activeConvId.current = conv.id;
                setActiveConv(conv);
                setConvs((prev) =>
                  prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
                );
              }}
              className="card p-4 flex items-center gap-4 cursor-pointer hover:border-slate-700 transition group"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-200 overflow-hidden shrink-0 relative">
                {conv.other_user?.avatar_url ? (
                  <img
                    src={conv.other_user.avatar_url}
                    alt={conv.other_user.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (conv.other_user?.full_name ?? 'U').charAt(0).toUpperCase()
                )}
                {conv.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                    {conv.unread_count > 9 ? '9+' : conv.unread_count}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p
                    className={`text-sm font-semibold truncate ${
                      conv.unread_count > 0 ? 'text-white' : 'text-slate-200'
                    }`}
                  >
                    {conv.other_user?.full_name ?? 'Usuario'}
                  </p>
                  <span className="text-[11px] text-slate-500 shrink-0 ml-2">
                    {fmt(conv.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {conv.buyer_id === profile?.id ? (
                    <Store className="w-3 h-3 text-slate-500 shrink-0" />
                  ) : (
                    <User className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                  <p className="text-xs text-slate-500 truncate">
                    {conv.part?.title ?? 'Repuesto eliminado'}
                  </p>
                </div>
              </div>

              {/* Part image */}
              {conv.part && (
                <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 hidden sm:block">
                  {conv.part.image_url ? (
                    <img
                      src={conv.part.image_url}
                      alt={conv.part.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-slate-600" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasOlderConversations && convs.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => load(convs.length)} disabled={loadingOlderConversations} className="text-xs text-orange-400 hover:text-orange-300 disabled:opacity-50">
            {loadingOlderConversations ? 'Cargando...' : 'Cargar conversaciones anteriores'}
          </button>
        </div>
      )}

      {/* Chat modal */}
      {activeConv && activeConv.part && activeConv.other_user && (
        <ChatModal
          conversationId={activeConv.id}
          part={activeConv.part}
          otherUser={activeConv.other_user}
          onClose={() => {
            activeConvId.current = null;
            setActiveConv(null);
          }}
        />
      )}
    </div>
  );
}
