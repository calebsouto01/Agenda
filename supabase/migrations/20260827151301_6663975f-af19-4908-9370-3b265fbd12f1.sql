REVOKE EXECUTE ON FUNCTION public.owns_establishment(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_establishment(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;