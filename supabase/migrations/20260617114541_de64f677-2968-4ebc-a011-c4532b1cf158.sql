CREATE TABLE public.flowmart_orders (
  id text PRIMARY KEY,
  ts bigint NOT NULL,
  closes_at bigint NOT NULL,
  customer_email text NOT NULL DEFAULT 'guest@flowmart',
  customer_name text NOT NULL,
  contact text,
  address jsonb NOT NULL,
  category text,
  items jsonb NOT NULL,
  total_amount integer NOT NULL DEFAULT 0,
  deposit_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'closed')),
  closed_at bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flowmart_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flowmart_orders TO authenticated;
GRANT ALL ON public.flowmart_orders TO service_role;
ALTER TABLE public.flowmart_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view Flowmart orders" ON public.flowmart_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create Flowmart orders" ON public.flowmart_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update Flowmart orders" ON public.flowmart_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete Flowmart orders" ON public.flowmart_orders FOR DELETE TO anon, authenticated USING (true);
CREATE OR REPLACE FUNCTION public.flowmart_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER flowmart_orders_updated_at
BEFORE UPDATE ON public.flowmart_orders
FOR EACH ROW
EXECUTE FUNCTION public.flowmart_set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.flowmart_orders;