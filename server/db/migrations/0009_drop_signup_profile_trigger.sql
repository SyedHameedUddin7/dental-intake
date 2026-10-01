-- Custom SQL migration file, put your code below! --

-- Stop creating profiles on sign-up entirely.
--
-- 0008 tried to gate the 0001 trigger on an app_metadata marker, on the
-- reasoning that only the service role can write app_metadata. The marker is
-- genuinely unforgeable, but the gate never fires: GoTrue inserts the auth.users
-- row first and applies app_metadata in a follow-up UPDATE, so an AFTER INSERT
-- trigger reads raw_app_meta_data before the marker has landed. The finished row
-- carries it; the trigger just cannot see it.
--
-- Rather than widen the trigger to UPDATE and re-introduce the timing question,
-- drop it. POST /api/staff already upserts the profile itself with the chosen
-- role, so nothing in the app depends on this, and the security property becomes
-- much easier to state: a profile exists only because an admin created it.
--
-- A user with no profile is exactly the 404 "Profile not found" case every
-- handler already returns and the UI already explains.
--
-- Bootstrapping the first admin now takes one statement instead of editing an
-- auto-created row (see README):
--   insert into public.profiles (id, role, full_name)
--   select id, 'admin', email from auth.users where email = 'you@clinic.test';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
