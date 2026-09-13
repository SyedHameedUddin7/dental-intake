-- Custom SQL migration file, put your code below! --

-- RLS for consents.
--
-- Migration 0002 enabled Row Level Security on every table that existed at the
-- time. `consents` was added later by 0006 (a generated migration, which does
-- not emit policies), so it was left with RLS OFF — meaning the publishable key
-- that ships to the browser could read every stored signature directly through
-- PostgREST. This closes that gap on the same model as 0002.

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- Any staff member may read consents. current_user_role() returns NULL for a
-- caller with no profile row, so a bare authenticated token fails closed.
CREATE POLICY "consents_select" ON public.consents
  FOR SELECT TO authenticated
  USING (public.current_user_role() IS NOT NULL);

-- Front desk and admins collect signatures (mirrors CAN_SIGN in the API).
CREATE POLICY "consents_insert" ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk'));

-- No UPDATE or DELETE policy: a signed consent is legal proof, so the table is
-- append-only and immutable by default deny — the same posture as audit_log.
