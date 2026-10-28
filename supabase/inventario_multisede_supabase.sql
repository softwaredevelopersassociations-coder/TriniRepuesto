-- =====================================================================
-- INVENTARIO MULTISEDE ADAPTADO A SUPABASE PARA TRINI REPUESTO
-- Ejecutar una sola vez desde Supabase Dashboard > SQL Editor como postgres.
-- Crea objetos en el esquema separado "distribuidora" para no alterar las
-- tablas actuales de public (profiles, parts, messages, motorcycles, etc.).
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;      -- búsqueda por texto parcial
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;   -- evita traslape de vigencias de precios

CREATE SCHEMA IF NOT EXISTS distribuidora;
SET LOCAL search_path TO distribuidora, public, extensions;

-- =====================================================================
-- 1. ADMINISTRADORES (identidad conectada a Supabase Auth)
-- =====================================================================
CREATE TABLE administradores (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE administradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY administradores_ver_propio_registro ON administradores
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION distribuidora.es_administrador()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, distribuidora
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM distribuidora.administradores a
        WHERE a.user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION distribuidora.es_administrador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distribuidora.es_administrador() TO authenticated;

-- =====================================================================
-- 2. SEDES, BODEGAS Y UBICACIONES
-- =====================================================================
CREATE TABLE sede (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  TEXT NOT NULL UNIQUE,
    ciudad  TEXT NOT NULL,
    tipo    TEXT NOT NULL DEFAULT 'sucursal' CHECK (tipo IN ('principal','sucursal')),
    activa  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE bodega (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sede_id  BIGINT NOT NULL REFERENCES sede(id),
    nombre   TEXT NOT NULL,
    activa   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (sede_id, nombre)
);

CREATE TABLE ubicacion (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bodega_id  BIGINT NOT NULL REFERENCES bodega(id),
    pasillo    TEXT NOT NULL,
    estante    TEXT NOT NULL,
    nivel      TEXT NOT NULL,
    casillero  TEXT NOT NULL,
    UNIQUE (bodega_id, pasillo, estante, nivel, casillero)
);

-- =====================================================================
-- 3. CATÁLOGO
-- =====================================================================
CREATE TABLE categoria (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              TEXT NOT NULL,
    categoria_padre_id  BIGINT REFERENCES categoria(id),
    UNIQUE (categoria_padre_id, nombre)
);

CREATE TABLE marca_repuesto (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       TEXT NOT NULL UNIQUE,
    es_original  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE articulo (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku              TEXT NOT NULL UNIQUE,            -- nunca se reutiliza
    codigo_barras    TEXT UNIQUE,
    nombre           TEXT NOT NULL,
    descripcion      TEXT,
    categoria_id     BIGINT NOT NULL REFERENCES categoria(id),
    marca_id         BIGINT REFERENCES marca_repuesto(id),
    tipo_calidad     TEXT NOT NULL DEFAULT 'alterno'
                     CHECK (tipo_calidad IN ('original','alterno','generico')),
    unidad_medida    TEXT NOT NULL DEFAULT 'pieza'
                     CHECK (unidad_medida IN ('pieza','par','juego','litro','metro')),
    peso_kg          NUMERIC(10,3) CHECK (peso_kg >= 0),
    largo_cm         NUMERIC(8,2)  CHECK (largo_cm >= 0),
    ancho_cm         NUMERIC(8,2)  CHECK (ancho_cm >= 0),
    alto_cm          NUMERIC(8,2)  CHECK (alto_cm >= 0),
    especificaciones JSONB NOT NULL DEFAULT '{}'::jsonb,  -- material, voltaje, dientes, etc.
    maneja_lote      BOOLEAN NOT NULL DEFAULT FALSE,      -- aceites, grasas, baterías
    impuesto_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (impuesto_pct >= 0),
    estado           TEXT NOT NULL DEFAULT 'activo'
                     CHECK (estado IN ('activo','descontinuado','inactivo'))
);

CREATE TABLE numero_parte (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    articulo_id  BIGINT NOT NULL REFERENCES articulo(id),
    numero       TEXT NOT NULL,
    tipo         TEXT NOT NULL CHECK (tipo IN ('oem','alterno','proveedor')),
    UNIQUE (articulo_id, numero, tipo)
);

CREATE TABLE modelo_moto (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marca       TEXT NOT NULL,
    modelo      TEXT NOT NULL,
    cilindrada  INTEGER CHECK (cilindrada > 0),
    anio_desde  SMALLINT NOT NULL,
    anio_hasta  SMALLINT,
    CHECK (anio_hasta IS NULL OR anio_hasta >= anio_desde),
    UNIQUE (marca, modelo, cilindrada, anio_desde)
);

CREATE TABLE compatibilidad (
    articulo_id    BIGINT NOT NULL REFERENCES articulo(id),
    modelo_moto_id BIGINT NOT NULL REFERENCES modelo_moto(id),
    posicion       TEXT NOT NULL DEFAULT 'n/a'
                   CHECK (posicion IN ('n/a','delantero','trasero','izquierdo','derecho',
                                       'delantero_izq','delantero_der','trasero_izq','trasero_der')),
    observaciones  TEXT,
    PRIMARY KEY (articulo_id, modelo_moto_id, posicion)
);

CREATE TABLE lote (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    articulo_id       BIGINT NOT NULL REFERENCES articulo(id),
    numero_lote       TEXT NOT NULL,
    fecha_ingreso     DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    UNIQUE (articulo_id, numero_lote)
);

-- =====================================================================
-- 4. DOCUMENTOS, STOCK Y MOVIMIENTOS
-- =====================================================================
CREATE TABLE documento (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          TEXT NOT NULL CHECK (tipo IN ('factura_compra','factura_venta','remision',
                                                'nota_credito','nota_debito','ajuste',
                                                'traslado','garantia')),
    numero        TEXT NOT NULL,
    fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
    observaciones TEXT,
    UNIQUE (tipo, numero)
);

-- Stock por artículo y bodega. NO se edita a mano: lo actualiza el trigger de movimiento.
CREATE TABLE stock (
    articulo_id         BIGINT NOT NULL REFERENCES articulo(id),
    bodega_id           BIGINT NOT NULL REFERENCES bodega(id),
    ubicacion_id        BIGINT REFERENCES ubicacion(id),
    cantidad            NUMERIC(14,3) NOT NULL DEFAULT 0,
    cantidad_reservada  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
    disponible          NUMERIC(14,3) GENERATED ALWAYS AS (cantidad - cantidad_reservada) STORED,
    costo_promedio      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
    stock_minimo        NUMERIC(14,3) CHECK (stock_minimo >= 0),
    punto_reorden       NUMERIC(14,3) CHECK (punto_reorden >= 0),
    stock_maximo        NUMERIC(14,3) CHECK (stock_maximo >= 0),
    PRIMARY KEY (articulo_id, bodega_id),
    -- Regla: no se permite stock negativo
    CONSTRAINT stock_no_negativo CHECK (cantidad >= 0),
    CONSTRAINT niveles_coherentes CHECK (
        (stock_minimo  IS NULL OR punto_reorden IS NULL OR punto_reorden >= stock_minimo) AND
        (punto_reorden IS NULL OR stock_maximo  IS NULL OR stock_maximo  >= punto_reorden)
    )
);

CREATE TABLE movimiento (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
    articulo_id    BIGINT NOT NULL REFERENCES articulo(id),
    bodega_id      BIGINT NOT NULL REFERENCES bodega(id),
    lote_id        BIGINT REFERENCES lote(id),
    tipo           TEXT NOT NULL CHECK (tipo IN (
                       'compra','venta','devolucion_cliente','devolucion_proveedor',
                       'traslado_salida','traslado_entrada',
                       'ajuste_entrada','ajuste_salida',
                       'garantia_entrada','garantia_salida')),
    cantidad       NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    sentido        SMALLINT NOT NULL CHECK (sentido IN (-1, 1)),  -- lo define el trigger según tipo
    costo_unitario NUMERIC(14,4) CHECK (costo_unitario >= 0),
    documento_id   BIGINT REFERENCES documento(id),
    usuario_id     UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    observaciones  TEXT
);

-- =====================================================================
-- 5. TRASLADOS ENTRE BODEGAS / SEDES
-- =====================================================================
CREATE TABLE traslado (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bodega_origen_id  BIGINT NOT NULL REFERENCES bodega(id),
    bodega_destino_id BIGINT NOT NULL REFERENCES bodega(id),
    estado            TEXT NOT NULL DEFAULT 'solicitado'
                      CHECK (estado IN ('solicitado','en_transito','recibido','cancelado')),
    fecha_solicitud   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_despacho    TIMESTAMPTZ,
    fecha_recepcion   TIMESTAMPTZ,
    CHECK (bodega_origen_id <> bodega_destino_id)
);

CREATE TABLE traslado_detalle (
    traslado_id         BIGINT NOT NULL REFERENCES traslado(id),
    articulo_id         BIGINT NOT NULL REFERENCES articulo(id),
    cantidad_solicitada NUMERIC(14,3) NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_enviada    NUMERIC(14,3) CHECK (cantidad_enviada >= 0),
    cantidad_recibida   NUMERIC(14,3) CHECK (cantidad_recibida >= 0),
    costo_unitario      NUMERIC(14,4),
    PRIMARY KEY (traslado_id, articulo_id)
);

-- =====================================================================
-- 6. PROVEEDORES Y COMPRAS
-- =====================================================================
CREATE TABLE proveedor (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                TEXT NOT NULL,
    identificacion_fiscal TEXT NOT NULL UNIQUE,
    pais                  TEXT NOT NULL,
    condiciones_pago      TEXT,
    moneda                CHAR(3) NOT NULL DEFAULT 'USD',
    activo                BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE articulo_proveedor (
    articulo_id         BIGINT NOT NULL REFERENCES articulo(id),
    proveedor_id        BIGINT NOT NULL REFERENCES proveedor(id),
    codigo_proveedor    TEXT,
    costo               NUMERIC(14,4) NOT NULL CHECK (costo >= 0),
    tiempo_entrega_dias INTEGER CHECK (tiempo_entrega_dias >= 0),
    cantidad_minima     NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (cantidad_minima > 0),
    es_principal        BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (articulo_id, proveedor_id)
);
-- Un solo proveedor principal por artículo
CREATE UNIQUE INDEX uq_proveedor_principal ON articulo_proveedor (articulo_id) WHERE es_principal;

CREATE TABLE orden_compra (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proveedor_id    BIGINT NOT NULL REFERENCES proveedor(id),
    bodega_destino_id BIGINT NOT NULL REFERENCES bodega(id),
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    estado          TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','enviada','parcial','recibida','cancelada'))
);

CREATE TABLE orden_compra_detalle (
    orden_compra_id    BIGINT NOT NULL REFERENCES orden_compra(id),
    articulo_id        BIGINT NOT NULL REFERENCES articulo(id),
    cantidad           NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    cantidad_recibida  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
    costo_unitario     NUMERIC(14,4) NOT NULL CHECK (costo_unitario >= 0),
    PRIMARY KEY (orden_compra_id, articulo_id)
);

-- =====================================================================
-- 7. CLIENTES, PRECIOS Y VENTAS
-- =====================================================================
CREATE TABLE lista_precio (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE cliente (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           TEXT NOT NULL,
    identificacion   TEXT UNIQUE,
    tipo             TEXT NOT NULL CHECK (tipo IN ('taller','tienda','mayorista','publico')),
    lista_precio_id  BIGINT NOT NULL REFERENCES lista_precio(id),
    limite_credito   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
    plazo_pago_dias  INTEGER NOT NULL DEFAULT 0 CHECK (plazo_pago_dias >= 0),
    activo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Historial de precios con vigencia; no se sobrescribe y no se permiten traslapes
CREATE TABLE precio (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    articulo_id      BIGINT NOT NULL REFERENCES articulo(id),
    lista_precio_id  BIGINT NOT NULL REFERENCES lista_precio(id),
    precio           NUMERIC(14,4) NOT NULL CHECK (precio >= 0),
    vigente_desde    DATE NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta    DATE,
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    EXCLUDE USING gist (
        articulo_id     WITH =,
        lista_precio_id WITH =,
        daterange(vigente_desde, vigente_hasta, '[)') WITH &&
    )
);

CREATE TABLE pedido (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id       BIGINT NOT NULL REFERENCES cliente(id),
    bodega_id        BIGINT NOT NULL REFERENCES bodega(id),   -- bodega de despacho
    fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado           TEXT NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','confirmado','despachado','facturado','cancelado')),
    descuento_pct    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100)
);

CREATE TABLE pedido_detalle (
    pedido_id        BIGINT NOT NULL REFERENCES pedido(id),
    articulo_id      BIGINT NOT NULL REFERENCES articulo(id),
    cantidad         NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(14,4) NOT NULL CHECK (precio_unitario >= 0),
    descuento_pct    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    impuesto_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (impuesto_pct >= 0),
    PRIMARY KEY (pedido_id, articulo_id)
);

-- =====================================================================
-- 8. ÍNDICES
-- =====================================================================
CREATE INDEX ix_articulo_categoria   ON articulo (categoria_id);
CREATE INDEX ix_articulo_marca       ON articulo (marca_id);
CREATE INDEX ix_articulo_nombre_trgm ON articulo USING gin (nombre gin_trgm_ops);
CREATE INDEX ix_articulo_espec       ON articulo USING gin (especificaciones);
CREATE INDEX ix_numparte_numero      ON numero_parte (upper(numero));
CREATE INDEX ix_numparte_trgm        ON numero_parte USING gin (numero gin_trgm_ops);
CREATE INDEX ix_compat_modelo        ON compatibilidad (modelo_moto_id);
CREATE INDEX ix_modelo_busqueda      ON modelo_moto (marca, modelo);
CREATE INDEX ix_stock_bodega         ON stock (bodega_id);
CREATE INDEX ix_mov_articulo_fecha   ON movimiento (articulo_id, fecha DESC);
CREATE INDEX ix_mov_bodega_fecha     ON movimiento (bodega_id, fecha DESC);
CREATE INDEX ix_mov_tipo_fecha       ON movimiento (tipo, fecha DESC);
CREATE INDEX ix_mov_documento        ON movimiento (documento_id);
CREATE INDEX ix_precio_vigente       ON precio (articulo_id, lista_precio_id, vigente_desde DESC);
CREATE INDEX ix_pedido_cliente       ON pedido (cliente_id, fecha DESC);
CREATE INDEX ix_oc_proveedor         ON orden_compra (proveedor_id);
CREATE INDEX ix_lote_vencimiento     ON lote (fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;

-- =====================================================================
-- 9. AUDITORÍA integrada con la sesión autenticada de Supabase
-- =====================================================================
CREATE FUNCTION fn_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
DECLARE
    v_usuario UUID := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.fecha_creacion := now();
        NEW.creado_por     := v_usuario;
    END IF;
    NEW.fecha_modificacion := now();
    NEW.modificado_por     := v_usuario;
    RETURN NEW;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sede','bodega','ubicacion','categoria','marca_repuesto','articulo','numero_parte',
        'modelo_moto','compatibilidad','lote','documento','stock','traslado','traslado_detalle',
        'proveedor','articulo_proveedor','orden_compra','orden_compra_detalle','lista_precio',
        'cliente','precio','pedido','pedido_detalle']
    LOOP
        EXECUTE format(
          'ALTER TABLE distribuidora.%I
             ADD COLUMN creado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
             ADD COLUMN fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT now(),
             ADD COLUMN modificado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
             ADD COLUMN fecha_modificacion  TIMESTAMPTZ', t);
        EXECUTE format(
          'CREATE TRIGGER trg_auditoria BEFORE INSERT OR UPDATE ON distribuidora.%I
             FOR EACH ROW EXECUTE FUNCTION distribuidora.fn_auditoria()', t);
    END LOOP;
END $$;

-- =====================================================================
-- 10. BORRADO LÓGICO: se impide el DELETE físico en tablas maestras
--     (así el SKU jamás se reutiliza)
-- =====================================================================
CREATE FUNCTION fn_bloquear_borrado()
RETURNS trigger LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
BEGIN
    RAISE EXCEPTION 'No se permite borrar físicamente de %. Cambie el estado a inactivo.', TG_TABLE_NAME;
END $$;

CREATE TRIGGER trg_no_delete BEFORE DELETE ON articulo
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_borrado();
CREATE TRIGGER trg_no_delete BEFORE DELETE ON proveedor
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_borrado();
CREATE TRIGGER trg_no_delete BEFORE DELETE ON cliente
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_borrado();

-- =====================================================================
-- 11. MOVIMIENTOS: actualizan el stock y son inmutables
-- =====================================================================
CREATE FUNCTION fn_aplicar_movimiento()
RETURNS trigger LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
DECLARE
    v_actual NUMERIC(14,3);
    v_costo  NUMERIC(14,4);
BEGIN
    -- Sentido según el tipo de movimiento
    NEW.sentido := CASE NEW.tipo
        WHEN 'compra'               THEN  1
        WHEN 'devolucion_cliente'   THEN  1
        WHEN 'traslado_entrada'     THEN  1
        WHEN 'ajuste_entrada'       THEN  1
        WHEN 'garantia_entrada'     THEN  1
        ELSE -1
    END;

    -- Asegura la fila de stock y la bloquea para evitar condiciones de carrera
    INSERT INTO stock (articulo_id, bodega_id)
    VALUES (NEW.articulo_id, NEW.bodega_id)
    ON CONFLICT (articulo_id, bodega_id) DO NOTHING;

    SELECT cantidad, costo_promedio INTO v_actual, v_costo
    FROM stock
    WHERE articulo_id = NEW.articulo_id AND bodega_id = NEW.bodega_id
    FOR UPDATE;

    -- Salidas sin costo informado: se valoran al costo promedio vigente
    IF NEW.sentido = -1 AND NEW.costo_unitario IS NULL THEN
        NEW.costo_unitario := v_costo;
    END IF;

    -- Costo promedio ponderado: solo con entradas que traen costo
    IF NEW.sentido = 1 AND NEW.costo_unitario IS NOT NULL
       AND NEW.tipo IN ('compra','traslado_entrada','ajuste_entrada')
       AND (v_actual + NEW.cantidad) > 0 THEN
        v_costo := ((v_actual * v_costo) + (NEW.cantidad * NEW.costo_unitario))
                   / (v_actual + NEW.cantidad);
    END IF;

    IF v_actual + (NEW.cantidad * NEW.sentido) < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente: artículo %, bodega % (disponible %, solicitado %)',
            NEW.articulo_id, NEW.bodega_id, v_actual, NEW.cantidad;
    END IF;

    UPDATE stock
       SET cantidad       = v_actual + (NEW.cantidad * NEW.sentido),
           costo_promedio = v_costo
     WHERE articulo_id = NEW.articulo_id AND bodega_id = NEW.bodega_id;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_movimiento_stock BEFORE INSERT ON movimiento
    FOR EACH ROW EXECUTE FUNCTION fn_aplicar_movimiento();

CREATE FUNCTION fn_movimiento_inmutable()
RETURNS trigger LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
BEGIN
    RAISE EXCEPTION 'Los movimientos no se modifican ni se borran. Registre un movimiento de ajuste o reverso.';
END $$;

CREATE TRIGGER trg_movimiento_inmutable BEFORE UPDATE OR DELETE ON movimiento
    FOR EACH ROW EXECUTE FUNCTION fn_movimiento_inmutable();

-- Impide editar a mano la cantidad de stock fuera de la función de movimientos
CREATE FUNCTION fn_proteger_stock()
RETURNS trigger LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
BEGIN
    IF NEW.cantidad IS DISTINCT FROM OLD.cantidad
       AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'La cantidad de stock solo cambia mediante movimientos.';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_proteger_stock BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION fn_proteger_stock();

-- =====================================================================
-- 12. TRASLADOS: descuenta en origen al despachar, suma en destino al recibir
-- =====================================================================
CREATE FUNCTION fn_despachar_traslado(p_traslado BIGINT)
RETURNS void LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
DECLARE
    t  traslado%ROWTYPE;
    d  RECORD;
    v_doc BIGINT;
    v_costo NUMERIC(14,4);
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT distribuidora.es_administrador() THEN
        RAISE EXCEPTION 'No autorizado para gestionar inventario.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM traslado WHERE id = p_traslado FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Traslado % no existe', p_traslado; END IF;
    IF t.estado <> 'solicitado' THEN
        RAISE EXCEPTION 'El traslado % está en estado %, no puede despacharse', p_traslado, t.estado;
    END IF;

    INSERT INTO documento (tipo, numero) VALUES ('traslado', 'TR-' || p_traslado || '-SAL')
    RETURNING id INTO v_doc;

    FOR d IN SELECT * FROM traslado_detalle WHERE traslado_id = p_traslado LOOP
        SELECT costo_promedio INTO v_costo FROM stock
         WHERE articulo_id = d.articulo_id AND bodega_id = t.bodega_origen_id;

        UPDATE traslado_detalle
           SET cantidad_enviada = cantidad_solicitada,
               costo_unitario   = COALESCE(v_costo, 0)
         WHERE traslado_id = p_traslado AND articulo_id = d.articulo_id;

        INSERT INTO movimiento (articulo_id, bodega_id, tipo, cantidad, costo_unitario, documento_id, usuario_id)
        VALUES (d.articulo_id, t.bodega_origen_id, 'traslado_salida',
                d.cantidad_solicitada, COALESCE(v_costo, 0), v_doc, auth.uid());
    END LOOP;

    UPDATE traslado SET estado = 'en_transito', fecha_despacho = now() WHERE id = p_traslado;
END $$;

CREATE FUNCTION fn_recibir_traslado(p_traslado BIGINT)
RETURNS void LANGUAGE plpgsql
SET search_path = distribuidora, public, extensions
AS $$
DECLARE
    t  traslado%ROWTYPE;
    d  RECORD;
    v_doc BIGINT;
    v_recibida NUMERIC(14,3);
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT distribuidora.es_administrador() THEN
        RAISE EXCEPTION 'No autorizado para gestionar inventario.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM traslado WHERE id = p_traslado FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Traslado % no existe', p_traslado; END IF;
    IF t.estado <> 'en_transito' THEN
        RAISE EXCEPTION 'El traslado % está en estado %, no puede recibirse', p_traslado, t.estado;
    END IF;

    INSERT INTO documento (tipo, numero) VALUES ('traslado', 'TR-' || p_traslado || '-ENT')
    RETURNING id INTO v_doc;

    -- Si no se capturó cantidad_recibida, se asume igual a la enviada
    FOR d IN SELECT * FROM traslado_detalle WHERE traslado_id = p_traslado LOOP
        v_recibida := COALESCE(d.cantidad_recibida, d.cantidad_enviada);

        UPDATE traslado_detalle SET cantidad_recibida = v_recibida
         WHERE traslado_id = p_traslado AND articulo_id = d.articulo_id;

        IF v_recibida > 0 THEN
            INSERT INTO movimiento (articulo_id, bodega_id, tipo, cantidad, costo_unitario, documento_id, usuario_id)
            VALUES (d.articulo_id, t.bodega_destino_id, 'traslado_entrada',
                    v_recibida, d.costo_unitario, v_doc, auth.uid());
        END IF;
    END LOOP;

    UPDATE traslado SET estado = 'recibido', fecha_recepcion = now() WHERE id = p_traslado;
END $$;

-- =====================================================================
-- 13. VISTAS
-- =====================================================================
-- Stock con nombres legibles
CREATE VIEW v_stock AS
SELECT a.sku, a.nombre AS articulo, s.nombre AS sede, b.nombre AS bodega,
       st.cantidad, st.cantidad_reservada, st.disponible,
       st.costo_promedio, ROUND(st.cantidad * st.costo_promedio, 2) AS valor_inventario,
       u.pasillo, u.estante, u.nivel, u.casillero
FROM stock st
JOIN articulo a ON a.id = st.articulo_id
JOIN bodega  b ON b.id = st.bodega_id
JOIN sede    s ON s.id = b.sede_id
LEFT JOIN ubicacion u ON u.id = st.ubicacion_id
WHERE distribuidora.es_administrador();

-- Artículos que alcanzaron el punto de reorden (por bodega)
CREATE VIEW v_alerta_reorden AS
SELECT a.sku, a.nombre AS articulo, s.nombre AS sede, b.nombre AS bodega,
       st.disponible, st.stock_minimo, st.punto_reorden, st.stock_maximo,
       GREATEST(st.stock_maximo - st.disponible, 0) AS cantidad_sugerida
FROM stock st
JOIN articulo a ON a.id = st.articulo_id AND a.estado = 'activo'
JOIN bodega  b ON b.id = st.bodega_id
JOIN sede    s ON s.id = b.sede_id
WHERE st.punto_reorden IS NOT NULL
  AND st.disponible <= st.punto_reorden
  AND distribuidora.es_administrador();

-- Precio vigente hoy por artículo y lista
CREATE VIEW v_precio_vigente AS
SELECT p.articulo_id, p.lista_precio_id, l.nombre AS lista, p.precio
FROM precio p
JOIN lista_precio l ON l.id = p.lista_precio_id
WHERE CURRENT_DATE >= p.vigente_desde
  AND (p.vigente_hasta IS NULL OR CURRENT_DATE < p.vigente_hasta)
  AND distribuidora.es_administrador();

-- Búsqueda por moto: repuestos compatibles
CREATE VIEW v_repuestos_por_moto AS
SELECT m.marca, m.modelo, m.cilindrada, m.anio_desde, m.anio_hasta,
       a.sku, a.nombre AS articulo, c.posicion, a.tipo_calidad
FROM compatibilidad c
JOIN modelo_moto m ON m.id = c.modelo_moto_id
JOIN articulo a    ON a.id = c.articulo_id
WHERE a.estado = 'activo'
  AND distribuidora.es_administrador();

-- Clasificación ABC calculada con las ventas de los últimos 12 meses
-- Se refresca periódicamente:  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_clasificacion_abc;
CREATE MATERIALIZED VIEW mv_clasificacion_abc AS
WITH consumo AS (
    SELECT articulo_id, SUM(cantidad * COALESCE(costo_unitario, 0)) AS valor
    FROM movimiento
    WHERE tipo = 'venta' AND fecha >= now() - INTERVAL '12 months'
    GROUP BY articulo_id
), acumulado AS (
    SELECT articulo_id, valor,
           SUM(valor) OVER (ORDER BY valor DESC, articulo_id)
             / NULLIF(SUM(valor) OVER (), 0) AS pct_acumulado
    FROM consumo
)
SELECT articulo_id, valor, pct_acumulado,
       CASE WHEN pct_acumulado <= 0.80 THEN 'A'
            WHEN pct_acumulado <= 0.95 THEN 'B'
            ELSE 'C' END AS clase
FROM acumulado;

CREATE UNIQUE INDEX ux_abc_articulo ON mv_clasificacion_abc (articulo_id);

-- =====================================================================
-- 14. DATOS INICIALES
-- =====================================================================
INSERT INTO lista_precio (nombre)
VALUES ('Público'), ('Taller'), ('Mayorista'), ('Distribuidor')
ON CONFLICT (nombre) DO NOTHING;

-- =====================================================================
-- 15. SEGURIDAD PARA SUPABASE
-- Solo las cuentas registradas en distribuidora.administradores gestionan
-- este inventario. Las tablas public actuales quedan fuera de este esquema.
-- =====================================================================
GRANT USAGE ON SCHEMA distribuidora TO authenticated;
GRANT SELECT ON TABLE distribuidora.administradores TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA distribuidora TO authenticated;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sede','bodega','ubicacion','categoria','marca_repuesto','articulo','numero_parte',
        'modelo_moto','compatibilidad','lote','documento','stock','movimiento','traslado',
        'traslado_detalle','proveedor','articulo_proveedor','orden_compra',
        'orden_compra_detalle','lista_precio','cliente','precio','pedido','pedido_detalle']
    LOOP
        EXECUTE format('ALTER TABLE distribuidora.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY admin_all ON distribuidora.%I FOR ALL TO authenticated
             USING (distribuidora.es_administrador())
             WITH CHECK (distribuidora.es_administrador())', t);
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE distribuidora.%I TO authenticated', t);
    END LOOP;
END $$;

-- Estas vistas también filtran por administrador. La vista materializada no
-- se expone a clientes autenticados porque no aplica políticas por fila.
GRANT SELECT ON TABLE
    distribuidora.v_stock,
    distribuidora.v_alerta_reorden,
    distribuidora.v_precio_vigente,
    distribuidora.v_repuestos_por_moto
TO authenticated;
REVOKE ALL ON TABLE distribuidora.mv_clasificacion_abc FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION distribuidora.fn_despachar_traslado(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION distribuidora.fn_recibir_traslado(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION distribuidora.fn_despachar_traslado(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION distribuidora.fn_recibir_traslado(BIGINT) TO authenticated, service_role;

-- Acceso completo solo para procesos backend que usen la clave service_role.
GRANT USAGE ON SCHEMA distribuidora TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA distribuidora TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA distribuidora TO service_role;

COMMIT;

-- =====================================================================
-- EJEMPLO DE USO (descomentar para probar)
-- =====================================================================
-- INSERT INTO sede (nombre, ciudad, tipo) VALUES ('Central', 'Trinidad', 'principal');
-- INSERT INTO bodega (sede_id, nombre) VALUES (1, 'Bodega general');
-- INSERT INTO categoria (nombre) VALUES ('Frenos');
-- INSERT INTO articulo (sku, nombre, categoria_id) VALUES ('FRE-0001', 'Pastillas de freno delanteras', 1);
-- INSERT INTO movimiento (articulo_id, bodega_id, tipo, cantidad, costo_unitario)
--        VALUES (1, 1, 'compra', 50, 3.20);
-- SELECT * FROM v_stock;
--
-- Después de ejecutar este archivo, registra tu usuario de Supabase como
-- administrador (cambia el correo por uno existente en Authentication > Users):
-- INSERT INTO distribuidora.administradores (user_id)
-- SELECT id FROM auth.users WHERE lower(email) = lower('tu-correo@ejemplo.com')
-- ON CONFLICT (user_id) DO NOTHING;
--
-- Para acceder a las tablas desde la API: Project Settings > API > Exposed schemas,
-- agrega "distribuidora". En el cliente usa supabase.schema('distribuidora').
