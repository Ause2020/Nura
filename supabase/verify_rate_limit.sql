-- Verificación live de rate limiting (SQL editor, rol postgres/service_role).
-- Anon/authenticated no deben poder ejecutar ni leer.

-- 1) consume incrementa y deniega al superar el límite
-- SELECT public.consume_rate_limit('rl:test:ip:abc12345', 2, 60);
-- SELECT public.consume_rate_limit('rl:test:ip:abc12345', 2, 60);
-- SELECT public.consume_rate_limit('rl:test:ip:abc12345', 2, 60);
-- Esperado: allowed=true, true, false + retry_after > 0

-- 2) RLS: sin filas para authenticated
-- SET ROLE authenticated;
-- SELECT count(*) FROM public.rate_limit_windows;
-- Esperado: permission denied / 0

-- 3) Anon no ejecuta RPC
-- SET ROLE anon;
-- SELECT public.consume_rate_limit('rl:test:ip:abc12345', 2, 60);
-- Esperado: permission denied
