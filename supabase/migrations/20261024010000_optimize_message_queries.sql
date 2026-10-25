-- Cubren las consultas del historial paginado y los contadores de mensajes sin leer.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread_conversation_sender
  ON messages (conversation_id, sender_id)
  WHERE read_at IS NULL;

-- Ayudan a recuperar las conversaciones más recientes de cada participante.
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_recent
  ON conversations (buyer_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_seller_recent
  ON conversations (seller_id, last_message_at DESC);
