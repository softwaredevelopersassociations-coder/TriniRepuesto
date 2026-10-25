-- Coordenadas precisas de la tienda del proveedor.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS store_latitude double precision;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS store_longitude double precision;
