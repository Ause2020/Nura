"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function hashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

export function AuthRecoveryRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = hashParams();
    const isRecovery =
      search.get("type") === "recovery" || hash.get("type") === "recovery";

    if (pathname === "/" && search.get("code")) {
      const next = new URLSearchParams({
        code: search.get("code") ?? "",
        next: "/recuperar/nueva",
      });
      router.replace(`/auth/callback?${next.toString()}`);
      return;
    }

    if (pathname === "/" && search.get("token_hash") && isRecovery) {
      const next = new URLSearchParams({
        token_hash: search.get("token_hash") ?? "",
        type: "recovery",
        next: "/recuperar/nueva",
      });
      router.replace(`/auth/callback?${next.toString()}`);
      return;
    }

    if (isRecovery && pathname !== "/recuperar/nueva") {
      router.replace(`/recuperar/nueva${window.location.hash}`);
    }
  }, [pathname, router]);

  return null;
}
