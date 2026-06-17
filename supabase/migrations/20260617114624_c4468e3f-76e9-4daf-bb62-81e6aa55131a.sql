DROP POLICY IF EXISTS "Anyone can create Flowmart orders" ON public.flowmart_orders;
DROP POLICY IF EXISTS "Anyone can update Flowmart orders" ON public.flowmart_orders;
DROP POLICY IF EXISTS "Anyone can delete Flowmart orders" ON public.flowmart_orders;
CREATE POLICY "Flowmart can create valid orders" ON public.flowmart_orders
FOR INSERT TO anon, authenticated
WITH CHECK (
  id LIKE 'ORD-%'
  AND ts > 0
  AND closes_at > 0
  AND customer_name <> ''
  AND jsonb_typeof(address) = 'object'
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) > 0
  AND total_amount >= 0
  AND deposit_amount >= 0
  AND status IN ('pending', 'closed')
);
CREATE POLICY "Flowmart can update valid orders" ON public.flowmart_orders
FOR UPDATE TO anon, authenticated
USING (id LIKE 'ORD-%' OR id LIKE 'ORD-DEMO-%')
WITH CHECK (
  (id LIKE 'ORD-%' OR id LIKE 'ORD-DEMO-%')
  AND ts > 0
  AND closes_at > 0
  AND customer_name <> ''
  AND jsonb_typeof(address) = 'object'
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) > 0
  AND total_amount >= 0
  AND deposit_amount >= 0
  AND status IN ('pending', 'closed')
);
CREATE POLICY "Flowmart can cancel order records" ON public.flowmart_orders
FOR DELETE TO anon, authenticated
USING (id LIKE 'ORD-%' OR id LIKE 'ORD-DEMO-%');