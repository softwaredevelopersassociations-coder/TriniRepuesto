/*
# MotoCare — añadir carnet, ubicación de tienda, avatar + storage buckets

## Resumen
1. Añade columnas `carnet`, `store_location` y `avatar_url` a la tabla `profiles`.
2. Crea dos buckets de almacenamiento: `avatars` (fotos de perfil) y `product-photos` (fotos de repuestos).
3. Configura políticas de storage para que cada usuario pueda subir/leer/eliminar sus propios archivos, y todos puedan leer las imágenes públicas.

## Cambios en tablas
### profiles (modificada)
- `carnet` (text, opcional) — número de identificación/carnet del usuario
- `store_location` (text, opcional) — ubicación de la tienda
- `avatar_url` (text, opcional) — URL de la foto de perfil

## Storage
- Bucket `avatars` — público, para fotos de perfil
- Bucket `product-photos` — público, para fotos de repuestos
- Políticas: usuarios autenticados pueden subir a su propia carpeta, todos pueden leer

## Notas
- Las columnas se añaden con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para ser idempotentes.
- Los buckets se crean con `INSERT ... ON CONFLICT DO NOTHING` en `storage.buckets`.
*/

-- ===== Añadir columnas a profiles =====
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS carnet text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS store_location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- ===== Crear storage buckets =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ===== Políticas de storage para avatars =====
-- Lectura pública
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

-- Subir: solo el dueño de la carpeta
DROP POLICY IF EXISTS "avatar_owner_upload" ON storage.objects;
CREATE POLICY "avatar_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Actualizar: solo el dueño
DROP POLICY IF EXISTS "avatar_owner_update" ON storage.objects;
CREATE POLICY "avatar_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Eliminar: solo el dueño
DROP POLICY IF EXISTS "avatar_owner_delete" ON storage.objects;
CREATE POLICY "avatar_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Políticas de storage para product-photos =====
-- Lectura pública
DROP POLICY IF EXISTS "product_photo_public_read" ON storage.objects;
CREATE POLICY "product_photo_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-photos');

-- Subir: solo el dueño de la carpeta
DROP POLICY IF EXISTS "product_photo_owner_upload" ON storage.objects;
CREATE POLICY "product_photo_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Actualizar: solo el dueño
DROP POLICY IF EXISTS "product_photo_owner_update" ON storage.objects;
CREATE POLICY "product_photo_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Eliminar: solo el dueño
DROP POLICY IF EXISTS "product_photo_owner_delete" ON storage.objects;
CREATE POLICY "product_photo_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
