-- Custom SQL migration file, put your code below! --

-- Enable Supabase Realtime for the live status board.
--
-- Realtime streams postgres changes to subscribed clients. Two things are
-- required for the `visits` table:
--   1. It must belong to the `supabase_realtime` publication.
--   2. REPLICA IDENTITY FULL so UPDATE/DELETE events carry the whole row,
--      which Realtime needs to evaluate RLS (visits_select) per subscriber.
-- RLS already lets any authenticated staff SELECT visits, so all staff screens
-- receive every status change.

ALTER TABLE public.visits REPLICA IDENTITY FULL;

-- Add to the publication if it isn't already a member (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
  END IF;
END $$;
