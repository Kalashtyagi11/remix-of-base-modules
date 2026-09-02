ALTER TABLE public.core_fiscal_year ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read fiscal years" ON public.core_fiscal_year;
CREATE POLICY "Authenticated can read fiscal years"
ON public.core_fiscal_year
FOR SELECT
TO authenticated
USING (true);