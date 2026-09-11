import { buildPrivateObjectPath } from "@/lib/storage/paths";

type Uploadable = File | Blob | ArrayBuffer;

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: Uploadable,
        options?: { upsert?: boolean; contentType?: string }
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function uploadPrivateObject(
  supabase: StorageClient,
  input: {
    bucket: string;
    organizationId: string;
    entityId: string;
    file: Uploadable;
    fileName?: string;
    contentType?: string;
    upsert?: boolean;
  }
): Promise<{ path: string } | { error: string }> {
  const fileName =
    input.fileName ??
    (input.file instanceof File ? input.file.name : "archivo.bin");
  const path = buildPrivateObjectPath(
    input.organizationId,
    input.entityId,
    fileName
  );
  const contentType =
    input.contentType ??
    (input.file instanceof File || input.file instanceof Blob
      ? input.file.type
      : undefined);

  const { error } = await supabase.storage.from(input.bucket).upload(path, input.file, {
    upsert: input.upsert ?? false,
    contentType: contentType || undefined,
  });

  if (error) return { error: error.message };
  return { path };
}
