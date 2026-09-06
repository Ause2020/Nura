/** Cliente Supabase mínimo (browser, server o admin). */
export type InsightDbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};
