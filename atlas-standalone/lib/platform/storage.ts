import type { SupabaseClient } from '@supabase/supabase-js';
export interface PrivateStorage {
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; size: number } | null>;
  delete(key: string): Promise<void>;
}
export function createStorage(client: SupabaseClient): PrivateStorage {
  const files = client.storage.from('atlas-documents');
  return {
    async put(key, bytes, contentType) {
      const { error } = await files.upload(key, bytes, { contentType, upsert: false });
      if (error) throw new Error('Document upload failed');
    },
    async get(key) {
      const { data, error } = await files.download(key);
      if (error) {
        if ('statusCode' in error && ['404', '400'].includes(String(error.statusCode))) return null;
        throw new Error('Document download failed');
      }
      const body = new Uint8Array(await data.arrayBuffer());
      return { body, size: body.byteLength };
    },
    async delete(key) {
      const { error } = await files.remove([key]);
      if (error) throw new Error('Document deletion failed; retry to finish');
    },
  };
}

