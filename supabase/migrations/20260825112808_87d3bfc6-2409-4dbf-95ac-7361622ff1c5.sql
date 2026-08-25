REVOKE EXECUTE ON FUNCTION public.match_partner(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bot_public_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_partner(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_public_stats() TO service_role;