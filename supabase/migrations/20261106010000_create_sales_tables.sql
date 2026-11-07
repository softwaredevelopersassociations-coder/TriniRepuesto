-- Registro mínimo de cantidades vendidas por cada vendedor.
-- Las escrituras se realizarán mediante una RPC transaccional en una migración posterior.

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL
    REFERENCES public.sales (id) ON DELETE CASCADE,
  part_id uuid NOT NULL
    REFERENCES public.parts (id) ON DELETE RESTRICT,
  product_title text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  CONSTRAINT sale_items_one_line_per_product UNIQUE (sale_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_seller_created_at
  ON public.sales (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_items_part_id
  ON public.sale_items (part_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sales" ON public.sales;
CREATE POLICY "select_own_sales" ON public.sales
  FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'seller'
    )
  );

DROP POLICY IF EXISTS "select_own_sale_items" ON public.sale_items;
CREATE POLICY "select_own_sale_items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales
      WHERE sales.id = sale_items.sale_id
        AND sales.seller_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'seller'
    )
  );

-- El vendedor puede consultar su historial; las escrituras directas desde el
-- frontend quedan bloqueadas. La RPC posterior realizará registro y descuento
-- de stock dentro de la misma transacción.
REVOKE ALL ON TABLE public.sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sale_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sales, public.sale_items TO authenticated;

COMMENT ON TABLE public.sales IS
  'Encabezado mínimo de registro de venta: vendedor y fecha/hora automática.';
COMMENT ON TABLE public.sale_items IS
  'Productos y cantidades vendidos en cada registro de venta.';
COMMENT ON COLUMN public.sale_items.product_title IS
  'Nombre del producto al momento de la venta, conservado para el historial.';
