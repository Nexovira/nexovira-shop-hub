REVOKE ALL ON FUNCTION public.apply_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_stock(uuid) TO service_role;