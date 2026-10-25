-- Datos necesarios para las motos con foto, la compatibilidad de repuestos
-- y la ficha comercial de los proveedores.
ALTER TABLE motorcycles ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS compatible_motorcycles text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_details text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('motorcycle-photos', 'motorcycle-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "motorcycle_photo_public_read" ON storage.objects;
CREATE POLICY "motorcycle_photo_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'motorcycle-photos');

DROP POLICY IF EXISTS "motorcycle_photo_owner_upload" ON storage.objects;
CREATE POLICY "motorcycle_photo_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'motorcycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "motorcycle_photo_owner_update" ON storage.objects;
CREATE POLICY "motorcycle_photo_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'motorcycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'motorcycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "motorcycle_photo_owner_delete" ON storage.objects;
CREATE POLICY "motorcycle_photo_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'motorcycle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
