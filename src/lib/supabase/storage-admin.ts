import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type UploadBucketParams = {
  bucket: string;
  path: string;
  bytes: ArrayBuffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
};

export async function ensureStorageBucket(bucket: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const storage = supabase.storage as {
    getBucket: (name: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
    createBucket: (
      name: string,
      options?: { public?: boolean },
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { error: getError } = await storage.getBucket(bucket);
  if (!getError) return;

  const notFound = /not found|does not exist/i.test(getError.message ?? "");
  if (!notFound) {
    throw new Error(getError.message ?? `Falha ao verificar bucket ${bucket}.`);
  }

  const { error: createError } = await storage.createBucket(bucket, { public: true });
  if (createError && !/already exists/i.test(createError.message ?? "")) {
    throw new Error(createError.message ?? `Falha ao criar bucket ${bucket}.`);
  }
}

export async function uploadToStorageBucket(
  params: UploadBucketParams,
): Promise<{ storagePath: string; publicUrl: string }> {
  await ensureStorageBucket(params.bucket);

  const supabase = createSupabaseAdminClient();
  const body =
    params.bytes instanceof Uint8Array ? params.bytes : new Uint8Array(params.bytes);
  const { error: uploadError } = await supabase.storage
    .from(params.bucket)
    .upload(params.path, body, {
      contentType: params.contentType,
      cacheControl: params.cacheControl ?? "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Falha ao enviar ficheiro para o Storage.");
  }

  const { data } = supabase.storage.from(params.bucket).getPublicUrl(params.path);
  return {
    storagePath: params.path,
    publicUrl: data.publicUrl,
  };
}
