REVOKE ALL ON public.flowmart_orders FROM anon, authenticated, public;
GRANT ALL ON public.flowmart_orders TO service_role;

-- Explicit deny policies so any future grant cannot unintentionally expose data.
DROP POLICY IF EXISTS "Deny all anon access to flowmart_orders" ON public.flowmart_orders;
CREATE POLICY "Deny all anon access to flowmart_orders"
  ON public.flowmart_orders
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all authenticated access to flowmart_orders" ON public.flowmart_orders;
CREATE POLICY "Deny all authenticated access to flowmart_orders"
  ON public.flowmart_orders
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);