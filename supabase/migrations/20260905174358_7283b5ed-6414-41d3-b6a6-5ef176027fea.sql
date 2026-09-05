
ALTER TABLE public.ia_test_exceptions DROP CONSTRAINT IF EXISTS ia_test_exceptions_disp_chk;
ALTER TABLE public.ia_test_exceptions ADD CONSTRAINT ia_test_exceptions_disp_chk
  CHECK (disposition IS NULL OR disposition IN (
    'Finding Raised','No Finding - Isolated','No Finding - Compensating Control','Not an Exception',
    'More Testing Required','Corrected During Fieldwork'));

ALTER TABLE public.ia_test_exceptions DROP CONSTRAINT IF EXISTS ia_test_exceptions_eval_chk;
ALTER TABLE public.ia_test_exceptions ADD CONSTRAINT ia_test_exceptions_eval_chk
  CHECK (evaluation_status IN ('Open','Evaluated','Further Work Required'));
