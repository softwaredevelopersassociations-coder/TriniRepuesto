-- Delivery receipts for the in-app chat.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- A recipient can acknowledge receipt/read status only for another user's message.
DROP POLICY IF EXISTS "update_read_at" ON public.messages;
DROP POLICY IF EXISTS "update_incoming_message_receipts" ON public.messages;

CREATE POLICY "update_incoming_message_receipts" ON public.messages FOR UPDATE
  TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- Authenticated clients may change receipt fields, not message content or ownership.
REVOKE UPDATE ON TABLE public.messages FROM authenticated;
GRANT UPDATE (delivered_at, read_at) ON TABLE public.messages TO authenticated;
