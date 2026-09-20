import { headers } from "next/headers";
import type { NavTraceCtx } from "@/lib/perf/dev-time";

/** Node/RSC only. Do not import from Edge middleware. */
export async function rscNavCtx(path: string): Promise<NavTraceCtx> {
  try {
    const headerList = await headers();
    const host = headerList.get("host");
    const nextUrl = headerList.get("next-url");
    if (nextUrl) {
      if (nextUrl.startsWith("http://") || nextUrl.startsWith("https://")) {
        return { path: new URL(nextUrl).pathname, host };
      }
      const pathname = nextUrl.split("?")[0];
      return { path: pathname || path, host };
    }
    return { path, host };
  } catch {
    return { path };
  }
}
