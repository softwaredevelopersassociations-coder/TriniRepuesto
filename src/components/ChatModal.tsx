import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Message, Part } from '@/types';
import { X, Send, Package } from 'lucide-react';

const PAGE_SIZE = 50;

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    // Realtime can deliver our persisted row after the insert request returns.
    // Replace the local optimistic copy so it does not appear twice.
    const localCopy = [...byId.values()]
      .filter((existing) => {
        const timeDifference = Math.abs(Date.parse(existing.created_at) - Date.parse(message.created_at));
        return (existing.id.startsWith('local-') || existing.id.startsWith('pending-')) &&
          timeDifference <= 5 * 60 * 1000 &&
          existing.conversation_id === message.conversation_id &&
          existing.sender_id === message.sender_id &&
          existing.content === message.content;
      })
      .sort((a, b) =>
        Math.abs(Date.parse(a.created_at) - Date.parse(message.created_at)) -
        Math.abs(Date.parse(b.created_at) - Date.parse(message.created_at))
      )[0];
    if (localCopy) byId.delete(localCopy.id);
    byId.set(message.id, { ...byId.get(message.id), ...message });
  });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

type Props = {
  conversationId: string;
  part: Pick<Part, 'id' | 'title' | 'image_url' | 'price'>;
  otherUser: { id: string; full_name: string; avatar_url: string | null };
  onClose: () => void;
};

export default function ChatModal({ conversationId, part, otherUser, onClose }: Props) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const realtimeConnectedRef = useRef(false);
  const shouldScrollToBottom = useRef(true);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMarkRead = () => {
    if (!profile || markReadTimer.current) return;
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null;
      const readAt = new Date().toISOString();
      supabase
        .from('messages')
        .update({ delivered_at: readAt, read_at: readAt })
        .eq('conversation_id', conversationId)
        .neq('sender_id', profile.id)
        .is('read_at', null)
        .then(async ({ error: receiptError }) => {
          if (receiptError && /delivered_at/i.test(receiptError.message)) {
            // Keep read receipts working while the Supabase migration is pending.
            const { error: readError } = await supabase
              .from('messages')
              .update({ read_at: readAt })
              .eq('conversation_id', conversationId)
              .neq('sender_id', profile.id)
              .is('read_at', null);
            if (readError) setError('No se pudo actualizar el estado de lectura.');
            return;
          }
          if (receiptError) setError('No se pudo actualizar el estado de lectura.');
        });
    }, 180);
  };

  const loadMessages = async () => {
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (loadError) {
      setError('No se pudieron cargar los mensajes. Intenta de nuevo.');
      return;
    }
    const newest = (data as Message[]) || [];
    shouldScrollToBottom.current = true;
    setMessages((current) => mergeMessages(current, [...newest].reverse()));
    setHasMore(newest.length === PAGE_SIZE);
    scheduleMarkRead();
  };

  useEffect(() => {
    loadMessages();
    let active = true;
    let syncing = false;
    realtimeConnectedRef.current = false;
    setRealtimeConnected(false);

    const channel = supabase
      .channel('chat:' + conversationId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'conversation_id=eq.' + conversationId,
        },
        (payload) => {
          const message = payload.new as Message;
          setMessages((current) => mergeMessages(current, [message]));
          if (message.sender_id !== profile?.id) scheduleMarkRead();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: 'conversation_id=eq.' + conversationId,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((current) => current.map((message) => message.id === updated.id
            ? { ...message, delivered_at: updated.delivered_at, read_at: updated.read_at }
            : message));
        }
      )
      .subscribe((status) => {
        if (!active) return;
        const connected = status === 'SUBSCRIBED';
        realtimeConnectedRef.current = connected;
        setRealtimeConnected(connected);
        // Catch up on messages sent while the connection was reconnecting.
        if (connected) void loadMessages();
      });

    // Realtime is the primary delivery path. This lightweight fallback keeps
    // an open chat current during network drops or while Realtime is being set
    // up for the messages table in Supabase.
    const fallbackSync = window.setInterval(async () => {
      if (!active || realtimeConnectedRef.current || syncing) return;
      syncing = true;
      const { data, error: syncError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      syncing = false;
      if (!active || syncError || !data?.length) return;

      const latest = (data as Message[]).reverse();
      const knownIds = new Set(messagesRef.current.map((message) => message.id));
      const hasNewIncoming = latest.some((message) =>
        message.sender_id !== profile?.id && !knownIds.has(message.id)
      );
      if (hasNewIncoming) scheduleMarkRead();
      setMessages((current) => mergeMessages(current, latest));
    }, 2500);

    return () => {
      active = false;
      realtimeConnectedRef.current = false;
      window.clearInterval(fallbackSync);
      if (markReadTimer.current) clearTimeout(markReadTimer.current);
      supabase.removeChannel(channel);
    };
    // The channel and initial query are scoped to this conversation and signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, profile]);

  useEffect(() => {
    messagesRef.current = messages;
    if (shouldScrollToBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadOlderMessages = async () => {
    const oldest = messages[0];
    const list = messageListRef.current;
    if (!oldest || !list || loadingOlder || !hasMore) return;
    const previousHeight = list.scrollHeight;
    const previousTop = list.scrollTop;
    setLoadingOlder(true);
    setError(null);
    const { data, error: olderError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (olderError) {
      setError('No se pudieron cargar los mensajes anteriores.');
    } else {
      const older = ((data as Message[]) || []).reverse();
      setHasMore((data || []).length === PAGE_SIZE);
      shouldScrollToBottom.current = false;
      setMessages((current) => mergeMessages(current, older));
      requestAnimationFrame(() => {
        const currentList = messageListRef.current;
        if (currentList) currentList.scrollTop = previousTop + currentList.scrollHeight - previousHeight;
      });
    }
    setLoadingOlder(false);
  };

  const sendMessage = async () => {
    if (!text.trim() || !profile || sending) return;
    setSending(true);
    setError(null);
    const content = text.trim();
    setText('');
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: Message = {
      id: pendingId,
      conversation_id: conversationId,
      sender_id: profile.id,
      content,
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    shouldScrollToBottom.current = true;
    setMessages((current) => mergeMessages(current, [pending]));
    // Do not request a returned row here: INSERT permission may be available
    // even when the current Supabase policies do not allow SELECT on that row.
    const { error: sendError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: profile.id, content });
    if (sendError) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      setText((current) => current || content);
      setError('No se pudo enviar el mensaje. Intenta de nuevo.');
    } else {
      // Keep the immediate local message visible. The Realtime INSERT event
      // will replace it with the database row when it arrives.
      setMessages((current) => current.map((message) =>
        message.id === pendingId ? { ...message, id: `local-${pendingId}` } : message
      ));
    }
    setSending(false);
  };

  const handleMessageScroll = () => {
    const list = messageListRef.current;
    if (list) shouldScrollToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const fmt = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card flex h-[100dvh] w-full flex-col rounded-none animate-fade-in sm:h-[560px] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-800 shrink-0">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-200 overflow-hidden shrink-0">
            {otherUser.avatar_url ? (
              <img
                src={otherUser.avatar_url}
                alt={otherUser.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              otherUser.full_name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm truncate">{otherUser.full_name}</p>
            <p className="text-xs text-slate-500 truncate">Sobre: {part.title}</p>
            <p className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${realtimeConnected ? 'text-green-400' : 'text-slate-500'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${realtimeConnected ? 'bg-green-400' : 'bg-slate-500 animate-pulse'}`} />
              {realtimeConnected ? 'Mensajería en tiempo real' : 'Sincronizando mensajes'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition shrink-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Part mini card */}
        <div className="mx-4 mt-3 mb-1 flex items-center gap-3 p-2.5 bg-slate-800/60 rounded-xl border border-slate-700 shrink-0">
          {part.image_url ? (
            <img
              src={part.image_url}
              alt={part.title}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-slate-500" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{part.title}</p>
            <p className="text-xs text-green-400 font-semibold">${part.price.toLocaleString()}</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={messageListRef} onScroll={handleMessageScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {hasMore && messages.length > 0 && (
            <div className="flex justify-center pb-2">
              <button type="button" onClick={loadOlderMessages} disabled={loadingOlder} className="text-xs text-orange-400 hover:text-orange-300 disabled:opacity-50">
                {loadingOlder ? 'Cargando...' : 'Cargar mensajes anteriores'}
              </button>
            </div>
          )}
          {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500 text-sm">Inicia la conversación...</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === profile?.id;
            const isPending = msg.id.startsWith('pending-');
            const statusLabel = isPending
              ? 'Enviando'
              : msg.read_at
                ? 'Leído'
                : msg.delivered_at
                  ? 'Entregado'
                  : 'Enviado';
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                    isMe
                      ? 'bg-orange-500 text-white rounded-br-sm'
                      : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      isMe ? 'text-orange-200/70 text-right' : 'text-slate-500'
                    }`}
                  >
                    {fmt(msg.created_at)}
                    {isMe && (
                      <span
                        className={`ml-1 ${msg.read_at ? 'text-green-300' : 'text-slate-400'}`}
                        title={statusLabel}
                        aria-label={`Estado del mensaje: ${statusLabel}`}
                      >
                        {isPending ? 'Enviando…' : msg.delivered_at || msg.read_at ? '✓✓' : '✓'}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="safe-bottom-padding flex shrink-0 items-end gap-2 border-t border-slate-800 p-3 sm:p-4">
          <textarea
            className="input flex-1 resize-none text-sm min-h-[40px] max-h-[120px]"
            rows={1}
            placeholder="Escribe un mensaje... (Enter para enviar)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="btn-primary p-2.5 shrink-0 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
