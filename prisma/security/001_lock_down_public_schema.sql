-- Ferme l'accès public au schéma `public`.
--
-- Apogee ne passe jamais par l'API REST de Supabase (aucune dépendance
-- supabase-js, aucun import dans src/) : tout transite par Prisma sur la
-- connexion Postgres, avec le rôle `postgres` qui a rolbypassrls = true.
-- Les rôles `anon` / `authenticated` n'ont donc aucune raison d'exister
-- pour cette base — or ils ont aujourd'hui SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE sur les 12 tables, RLS désactivée, zéro policy.
--
-- Ce script est sans effet sur Prisma : le rôle `postgres` contourne RLS
-- et conserve tous ses droits.

BEGIN;

-- 1. RLS active partout, sans policy = deny by default pour tout rôle
--    qui ne contourne pas RLS. C'est ce que réclame l'alerte Supabase.
ALTER TABLE public."Account"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdAccount"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AutopilotAgent"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BrandSettings"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CopyGeneration"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CreativeKnowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GhlConnection"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LaunchHistory"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Report"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationToken" ENABLE ROW LEVEL SECURITY;

-- 2. Retire les droits eux-mêmes. La RLS seule suffirait, mais tant que
--    les GRANT restent, une seule policy ajoutée par erreur rouvrirait
--    tout. Ici l'API REST n'a simplement plus rien à lire.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- 3. Sans ça, le prochain `prisma migrate` recrée une table grande
--    ouverte : les default privileges du schéma accordent arwdDxtm à
--    anon et authenticated sur toute nouvelle table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

COMMIT;
