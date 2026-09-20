"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ComponentProps } from "react";

type AppNavLinkProps = ComponentProps<typeof Link> & {
  href: string;
};

/**
 * Sidebar / chrome links: no viewport prefetch burst.
 * Prefetch starts on hover or keyboard focus of that one route.
 */
export function AppNavLink({ href, onMouseEnter, onFocus, ...props }: AppNavLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  const prefetchRoute = useCallback(() => {
    if (pathname === href || pathname.startsWith(`${href}/`)) return;
    router.prefetch(href);
  }, [href, pathname, router]);

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        prefetchRoute();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        prefetchRoute();
        onFocus?.(event);
      }}
    />
  );
}
