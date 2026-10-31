-- Datos internos de inventario. Los costos y códigos SKU quedan separados de
-- public.parts, cuyos datos se consultan en el marketplace.

CREATE TABLE IF NOT EXISTS public.part_inventory (
  part_id uuid PRIMARY KEY REFERENCES public.parts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sku text,
  purchase_cost numeric(10, 2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  minimum_stock integer NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_part_inventory_user_sku
  ON public.part_inventory (user_id, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE INDEX IF NOT EXISTS idx_part_inventory_user_id
  ON public.part_inventory (user_id);

ALTER TABLE public.part_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_part_inventory" ON public.part_inventory;
CREATE POLICY "select_own_part_inventory" ON public.part_inventory FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_part_inventory" ON public.part_inventory;
CREATE POLICY "insert_own_part_inventory" ON public.part_inventory FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.parts
      WHERE parts.id = part_inventory.part_id
        AND parts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_part_inventory" ON public.part_inventory;
CREATE POLICY "update_own_part_inventory" ON public.part_inventory FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.parts
      WHERE parts.id = part_inventory.part_id
        AND parts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_part_inventory" ON public.part_inventory;
CREATE POLICY "delete_own_part_inventory" ON public.part_inventory FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_inventory TO authenticated;
