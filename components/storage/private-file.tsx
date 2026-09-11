"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PrivateDownloadKind } from "@/lib/storage/download-policy";

function usePrivateDownloadUrl(
  kind: PrivateDownloadKind,
  id: string | null | undefined,
  fileId?: string
) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ kind, id });
    if (fileId) params.set("fileId", fileId);

    void fetch(`/api/storage/download?${params.toString()}`, {
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { url?: string } | null) => {
        if (!cancelled) setUrl(payload?.url ?? null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, id, fileId]);

  return url;
}

export function PrivateFileLink({
  kind,
  id,
  fileId,
  className,
  children,
}: {
  kind: PrivateDownloadKind;
  id: string;
  fileId?: string;
  className?: string;
  children: ReactNode;
}) {
  const url = usePrivateDownloadUrl(kind, id, fileId);
  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

export function PrivateImage({
  kind,
  id,
  fileId,
  alt,
  className,
}: {
  kind: PrivateDownloadKind;
  id: string;
  fileId?: string;
  alt: string;
  className?: string;
}) {
  const url = usePrivateDownloadUrl(kind, id, fileId);
  if (!url) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} />
  );
}
