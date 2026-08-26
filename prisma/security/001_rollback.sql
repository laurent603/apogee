-- Rollback exact de 001_lock_down_public_schema.sql.
--
-- Restaure l'état observé avant application le 2026-08-26 :
-- RLS désactivée sur les 12 tables, anon/authenticated avec tous les
-- droits (arwdDxtm) sur tables, séquences et fonctions, et default
-- privileges accordant la même chose aux futures tables.
--
-- À n'utiliser que si un besoin réel d'API REST Supabase apparaît.
-- Rejouer ceci remet la base dans l'état signalé CRITICAL par Supabase.

BEGIN;

ALTER TABLE public."Account"           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdAccount"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."AutopilotAgent"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."BrandSettings"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."CopyGeneration"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."CreativeKnowledge" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."GhlConnection"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."LaunchHistory"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Report"            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session"           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationToken" DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;

COMMIT;
