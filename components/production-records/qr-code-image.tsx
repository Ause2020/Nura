"use client";

import { useEffect, useState } from "react";

interface QrCodeImageProps {
  value: string;
  size?: number;
}

export function QrCodeImage({ value, size = 220 }: QrCodeImageProps) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(value, {
        width: size,
        margin: 1,
        color: { dark: "#1B4332", light: "#FFFFFF" },
      }).then((url) => {
        if (!cancelled) setSrc(url);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        className="bg-zinc-100 animate-pulse rounded-md"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={src}
      alt="Código QR de monitoreo"
      width={size}
      height={size}
      className="rounded-md border border-border bg-white"
    />
  );
}
