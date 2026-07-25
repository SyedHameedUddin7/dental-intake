-- Custom SQL migration file, put your code below! --

-- Defense-in-depth Row Level Security.
--
-- The server API talks to Postgres over DATABASE_URL with a privileged role,
-- which BYPASSES RLS by design — RBAC there is enforced in application code.
-- These policies protect the anon/authenticated key that ships to the browser
-- (the Supabase client), so a leaked/abused key can't read or write freely.

-- Resolve the caller's role once, via SECURITY DEFINER so the lookup on
-- public.profiles does NOT re-trigger the profiles RLS policies (no recursion).
-- Returns NULL when the caller has no profile, so every policy fails closed.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

-- Enable RLS on every application table. With RLS on and no matching policy,
-- access is denied by default.
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_summaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;

-- profiles --------------------------------------------------------------------
-- Read your own row; admins read everyone. Row creation is handled by the
-- on_auth_user_created trigger (SECURITY DEFINER), so no INSERT policy is
-- exposed to clients. Only admins may change or remove profiles (role changes).
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_user_role() = 'admin');

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- patients --------------------------------------------------------------------
-- All staff can read patients. Front desk and admins create/update; only
-- admins delete.
CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk'));

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'front_desk'))
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk'));

CREATE POLICY "patients_delete_admin" ON public.patients
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- visits ----------------------------------------------------------------------
-- All staff read. Front desk/admin schedule and check in; dentists also update
-- (diagnosis, comments, status). Only admins delete.
CREATE POLICY "visits_select" ON public.visits
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "visits_insert" ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk'));

CREATE POLICY "visits_update" ON public.visits
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'))
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

CREATE POLICY "visits_delete_admin" ON public.visits
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- intake_submissions ----------------------------------------------------------
-- All staff read. Front desk/admin create intake records. Only admins may
-- amend or delete a submitted intake (keep the record trustworthy).
CREATE POLICY "intake_select" ON public.intake_submissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "intake_insert" ON public.intake_submissions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk'));

CREATE POLICY "intake_update_admin" ON public.intake_submissions
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "intake_delete_admin" ON public.intake_submissions
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- ai_summaries ----------------------------------------------------------------
-- All staff read. Dentists/admins create summaries. Only admins amend/delete.
CREATE POLICY "ai_summaries_select" ON public.ai_summaries
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_summaries_insert" ON public.ai_summaries
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'dentist'));

CREATE POLICY "ai_summaries_update_admin" ON public.ai_summaries
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "ai_summaries_delete_admin" ON public.ai_summaries
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- audit_log -------------------------------------------------------------------
-- Only admins can read the audit trail. Any authenticated actor may append.
-- No UPDATE/DELETE policy: the log is append-only (immutable by default deny).
CREATE POLICY "audit_select_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

CREATE POLICY "audit_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
