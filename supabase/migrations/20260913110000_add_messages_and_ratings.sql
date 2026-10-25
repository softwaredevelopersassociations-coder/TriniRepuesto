/*
# MotoCare — Mensajería y calificaciones de vendedores

## Nuevas tablas

### conversations
- Canal de comunicación entre un comprador y un vendedor sobre un repuesto específico.

### messages
- Mensajes individuales dentro de una conversación.

### seller_ratings
- Calificaciones (1-5) que compradores dan a vendedores por repuesto.
*/

-- ===== conversations =====
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now(),
  UNIQUE (part_id, buyer_id, seller_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- ===== messages =====
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_conversation_messages" ON messages;
CREATE POLICY "select_conversation_messages" ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_conversation_messages" ON messages;
CREATE POLICY "insert_conversation_messages" ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_read_at" ON messages;
CREATE POLICY "update_read_at" ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- ===== Trigger: actualizar last_message_at =====
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_last_message_at ON messages;
CREATE TRIGGER trg_update_last_message_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ===== seller_ratings =====
CREATE TABLE IF NOT EXISTS seller_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (char_length(comment) <= 500),
  created_at timestamptz DEFAULT now(),
  UNIQUE (seller_id, buyer_id, part_id)
);

ALTER TABLE seller_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_ratings" ON seller_ratings;
CREATE POLICY "select_all_ratings" ON seller_ratings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_rating" ON seller_ratings;
CREATE POLICY "insert_own_rating" ON seller_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "update_own_rating" ON seller_ratings;
CREATE POLICY "update_own_rating" ON seller_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

-- ===== Política para que compradores vean perfiles de vendedores =====
DROP POLICY IF EXISTS "select_seller_profiles" ON profiles;
CREATE POLICY "select_seller_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

-- ===== Índices =====
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_part_id ON conversations(part_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_seller_id ON seller_ratings(seller_id);
CREATE INDEX IF NOT EXISTS idx_ratings_part_id ON seller_ratings(part_id);
