import { supabase } from '@/lib/supabase';

export async function uploadFile(
  bucket: 'avatars' | 'product-photos' | 'motorcycle-photos',
  userId: string,
  file: File,
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('Upload error:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}
