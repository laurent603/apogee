-- À REJOUER APRÈS CHAQUE `prisma db push` / `prisma migrate`.
--
-- Les default privileges corrigés en 001 empêchent bien anon et authenticated
-- de recevoir des droits sur une table neuve — vérifié à la création de
-- `ErrorLog`. En revanche PostgreSQL ne peut pas activer la RLS d'office :
-- toute nouvelle table naît avec `relrowsecurity = false`, et Supabase la
-- signalera en CRITICAL.
--
-- Ce script est idempotent : il active la RLS sur les tables qui ne l'ont pas
-- et ne touche pas aux autres. Le rejouer ne coûte rien.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    RAISE NOTICE 'RLS activée sur %', t.relname;
  END LOOP;
END $$;

-- Filet de sécurité : re-révoque au cas où une table aurait malgré tout
-- reçu des droits publics.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
