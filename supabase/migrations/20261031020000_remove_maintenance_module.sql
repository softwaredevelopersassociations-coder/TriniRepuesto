-- Retira el módulo de mantenimiento del backend.
-- No modifica perfiles, motocicletas, publicaciones ni inventario.
-- Al aplicar esta migración se eliminan los registros históricos de mantenimiento.
DROP TABLE IF EXISTS public.maintenance_records;
