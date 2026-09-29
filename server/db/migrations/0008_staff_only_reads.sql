-- Custom SQL migration file, put your code below! --

-- Two holes that both come down to "authenticated" not meaning "staff".

-- 1. Staff-only reads.
--
-- 0002 gave four tables `USING (true)`. Its header promised that a caller with
-- no profile fails closed, because current_user_role() returns NULL for them —
-- but these four policies never call it, so that guarantee never covered them.
-- An authenticated user with no profile row could read every patient, visit,
-- intake submission and AI summary straight through PostgREST using only the
-- publishable key that ships to the browser.
--
-- Naming the staff roles explicitly makes them fail closed for anyone who is
-- not provisioned staff: no profile, or some role added later (a patient login,
-- say) that is not on this list.
ALTER POLICY "patients_select" ON public.patients
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

ALTER POLICY "visits_select" ON public.visits
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

ALTER POLICY "intake_select" ON public.intake_submissions
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

ALTER POLICY "ai_summaries_select" ON public.ai_summaries
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

-- 0007 accepted any caller holding a profile; be explicit for the same reason.
ALTER POLICY "consents_select" ON public.consents
  USING (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

-- Appending to the audit trail is a staff action, not merely a signed-in one.
ALTER POLICY "audit_insert" ON public.audit_log
  WITH CHECK (public.current_user_role() IN ('admin', 'front_desk', 'dentist'));

-- 2. Only provision a profile for a login an admin deliberately created.
--
-- The 0001 trigger gave a profile to every new auth user, and profiles.role
-- defaults to 'front_desk' — so while signups were open, anyone who registered
-- became a front-desk staff member.
--
-- The marker is read from raw_app_meta_data, which only the service role can
-- write. raw_user_meta_data would not do: a client can set that itself during
-- sign-up (`options.data`), so it could forge its own promotion.
--
-- A user without the marker gets no profile at all, which every handler already
-- reports as 404 "Profile not found" and the UI explains rather than bouncing.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(new.raw_app_meta_data ->> 'provisioned', 'false') <> 'true' THEN
    RETURN new;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
