/** Cliente Supabase mínimo (browser o server) para el plan HACCP. */
export type HaccpDbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};
