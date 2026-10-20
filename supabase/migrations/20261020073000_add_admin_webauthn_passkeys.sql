-- Store VÉRIX Admin WebAuthn passkeys and short-lived, single-use challenges.
-- This is independent of the operational application and ASF motor.
CREATE TABLE IF NOT EXISTS public.verix_admin_passkeys (
  passkey_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id text NOT NULL,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transports) = 'array'),
  device_type text NOT NULL DEFAULT 'singleDevice',
  backed_up boolean NOT NULL DEFAULT false,
  rp_id text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT verix_admin_passkeys_credential_origin_uq UNIQUE (credential_id, rp_id, origin)
);

CREATE INDEX IF NOT EXISTS verix_admin_passkeys_origin_idx
  ON public.verix_admin_passkeys (rp_id, origin);

CREATE TABLE IF NOT EXISTS public.verix_admin_webauthn_challenges (
  challenge text PRIMARY KEY,
  ceremony text NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
  rp_id text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS verix_admin_webauthn_challenges_expiry_idx
  ON public.verix_admin_webauthn_challenges (expires_at);

ALTER TABLE public.verix_admin_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix_admin_webauthn_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verix_admin_passkeys_deny_clients ON public.verix_admin_passkeys;
CREATE POLICY verix_admin_passkeys_deny_clients
  ON public.verix_admin_passkeys FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS verix_admin_webauthn_challenges_deny_clients ON public.verix_admin_webauthn_challenges;
CREATE POLICY verix_admin_webauthn_challenges_deny_clients
  ON public.verix_admin_webauthn_challenges FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.verix_admin_passkeys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.verix_admin_webauthn_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verix_admin_passkeys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verix_admin_webauthn_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.verix2_consume_admin_webauthn_challenge(
  p_challenge text,
  p_ceremony text,
  p_rp_id text,
  p_origin text
)
RETURNS TABLE(challenge text, ceremony text, rp_id text, origin text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH consumed AS (
    DELETE FROM public.verix_admin_webauthn_challenges AS c
    WHERE c.challenge = p_challenge
      AND c.ceremony = p_ceremony
      AND c.rp_id = p_rp_id
      AND c.origin = p_origin
      AND c.expires_at > now()
    RETURNING c.challenge, c.ceremony, c.rp_id, c.origin
  )
  SELECT consumed.challenge, consumed.ceremony, consumed.rp_id, consumed.origin
  FROM consumed;
$function$;

REVOKE ALL ON FUNCTION public.verix2_consume_admin_webauthn_challenge(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_consume_admin_webauthn_challenge(text, text, text, text) TO service_role;
