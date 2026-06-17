
DROP POLICY IF EXISTS "Anyone can view Flowmart orders" ON public.flowmart_orders;
DROP POLICY IF EXISTS "Flowmart can create valid orders" ON public.flowmart_orders;
DROP POLICY IF EXISTS "Flowmart can update valid orders" ON public.flowmart_orders;
DROP POLICY IF EXISTS "Flowmart can cancel order records" ON public.flowmart_orders;

REVOKE ALL ON public.flowmart_orders FROM anon;
REVOKE ALL ON public.flowmart_orders FROM authenticated;

ALTER PUBLICATION supabase_realtime DROP TABLE public.flowmart_orders;
