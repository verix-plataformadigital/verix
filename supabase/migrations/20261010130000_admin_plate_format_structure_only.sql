-- Admin-only classification: validate the registration layout, not the exact series allocation.
-- This feeds only administrative analytics; it does not change VÉRIX client validation or the ASF motor.
CREATE OR REPLACE FUNCTION public.verix_portuguese_plate_base_valid(p_raw text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT upper(btrim(coalesce(p_raw, ''))) ~
    '^(?:[A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{2}|[0-9]{2}[ -]?[0-9]{2}[ -]?[A-Z]{2}|[0-9]{2}[ -]?[A-Z]{2}[ -]?[0-9]{2}|[A-Z]{2}[ -]?[0-9]{2}[ -]?[A-Z]{2})$';
$function$;

CREATE OR REPLACE FUNCTION public.verix_portuguese_plate_format_valid(p_raw text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v text := upper(btrim(coalesce(p_raw, '')));
  m text[];
BEGIN
  IF public.verix_portuguese_plate_base_valid(v) THEN RETURN true; END IF;

  -- Industrial machinery: a supported base registration plus class A-H.
  m := regexp_match(v, '^(.+?)[ -]?([A-H])$');
  IF m IS NOT NULL AND public.verix_portuguese_plate_base_valid(m[1]) THEN RETURN true; END IF;

  -- Diplomatic/consular registrations.
  IF v ~ '^[0-9]{3}[ -](CD|CC|FM)[0-9]{3}$' THEN RETURN true; END IF;

  -- Export registrations.
  IF v ~ '^[0-9]+[ -]?[LPAM]$' THEN RETURN true; END IF;

  -- Trailer registrations by regional service code.
  RETURN v ~ '^(AV|BE|BN|BR|CB|FA|GD|LE|PT|SA|SE|VC|VR|VI|AN|H|A|M|L|P|C|E)[ -]?[0-9]{1,6}$';
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_portuguese_plate_base_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix_portuguese_plate_format_valid(text) FROM PUBLIC, anon, authenticated;
