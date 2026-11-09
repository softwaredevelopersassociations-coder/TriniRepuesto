-- Guarda una instantánea del precio vigente en cada línea de venta.
-- Los registros anteriores conservan NULL porque no es posible reconstruir con
-- certeza el precio cobrado en el pasado a partir del precio actual del producto.

BEGIN;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sale_items'::regclass
      AND conname = 'sale_items_unit_price_nonnegative'
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_unit_price_nonnegative
      CHECK (unit_price IS NULL OR unit_price >= 0);
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.register_sale(p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_seller_id uuid := auth.uid();
  v_sale_id uuid;
  v_item jsonb;
  v_part_id_text text;
  v_part_id uuid;
  v_quantity_numeric numeric;
  v_quantity integer;
  v_seen_part_ids uuid[] := ARRAY[]::uuid[];
  v_sale_item record;
  v_product_title text;
  v_stock integer;
  v_status text;
  v_unit_price numeric(10,2);
BEGIN
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Debes iniciar sesión para registrar una venta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = v_seller_id
      AND profile.role = 'seller'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Solo un vendedor puede registrar ventas.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'La venta debe incluir una lista de productos.';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Agrega al menos un producto a la venta.';
  END IF;

  -- Validar el payload completo antes de crear el encabezado.
  FOR v_item IN
    SELECT payload.item
    FROM jsonb_array_elements(p_items) AS payload(item)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Cada línea debe contener un producto y una cantidad.';
    END IF;

    v_part_id_text := v_item ->> 'part_id';
    IF v_part_id_text IS NULL
      OR v_part_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Una línea contiene un producto no válido.';
    END IF;
    v_part_id := v_part_id_text::uuid;

    IF jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'La cantidad de cada producto debe ser un entero positivo.';
    END IF;

    v_quantity_numeric := (v_item ->> 'quantity')::numeric;
    IF v_quantity_numeric <= 0
      OR v_quantity_numeric <> trunc(v_quantity_numeric)
      OR v_quantity_numeric > 2147483647
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'La cantidad de cada producto debe ser un entero positivo.';
    END IF;

    IF v_part_id = ANY (v_seen_part_ids) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Cada producto debe aparecer una sola vez; ajusta su cantidad en la misma línea.';
    END IF;
    v_seen_part_ids := array_append(v_seen_part_ids, v_part_id);
  END LOOP;

  -- Primero bloquear y validar todos los productos, sin escribir cambios. Así,
  -- si una línea falla, no se crea encabezado ni se descuenta ninguna unidad.
  -- El orden estable reduce interbloqueos entre ventas simultáneas.
  FOR v_sale_item IN
    SELECT
      (payload.item ->> 'part_id')::uuid AS part_id,
      (payload.item ->> 'quantity')::integer AS quantity
    FROM jsonb_array_elements(p_items) AS payload(item)
    ORDER BY (payload.item ->> 'part_id')::uuid
  LOOP
    SELECT part.title, part.stock, part.status, part.price
    INTO v_product_title, v_stock, v_status, v_unit_price
    FROM public.parts AS part
    WHERE part.id = v_sale_item.part_id
      AND part.user_id = v_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Uno de los productos no existe o no pertenece a tu inventario.';
    END IF;

    IF v_status = 'sold' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Uno de los productos está marcado como vendido y no se puede agregar.';
    END IF;

    IF v_sale_item.quantity > v_stock THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'No hay suficiente stock para uno de los productos. Actualiza las cantidades e inténtalo de nuevo.';
    END IF;
  END LOOP;

  INSERT INTO public.sales (seller_id)
  VALUES (v_seller_id)
  RETURNING id INTO v_sale_id;

  -- Los bloqueos adquiridos durante la validación se mantienen hasta el fin de
  -- esta transacción; se puede guardar cada línea y descontar su stock seguro.
  FOR v_sale_item IN
    SELECT
      (payload.item ->> 'part_id')::uuid AS part_id,
      (payload.item ->> 'quantity')::integer AS quantity
    FROM jsonb_array_elements(p_items) AS payload(item)
    ORDER BY (payload.item ->> 'part_id')::uuid
  LOOP
    SELECT part.title, part.stock, part.status, part.price
    INTO v_product_title, v_stock, v_status, v_unit_price
    FROM public.parts AS part
    WHERE part.id = v_sale_item.part_id
      AND part.user_id = v_seller_id;

    INSERT INTO public.sale_items (sale_id, part_id, product_title, quantity, unit_price)
    VALUES (v_sale_id, v_sale_item.part_id, v_product_title, v_sale_item.quantity, v_unit_price);

    UPDATE public.parts AS part
    SET
      stock = v_stock - v_sale_item.quantity,
      status = CASE
        WHEN v_stock - v_sale_item.quantity = 0 THEN 'sold'
        ELSE v_status
      END
    WHERE part.id = v_sale_item.part_id
      AND part.user_id = v_seller_id;
  END LOOP;

  RETURN v_sale_id;
END;
$function$;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.sales, public.sale_items
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.register_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_sale(jsonb) TO authenticated;

COMMENT ON FUNCTION public.register_sale(jsonb) IS
  'Registra productos, cantidades y precio unitario, y descuenta stock de forma atómica.';

COMMENT ON COLUMN public.sale_items.unit_price IS
  'Precio unitario del producto al registrar la venta. NULL indica una venta histórica sin precio registrado.';

COMMIT;
