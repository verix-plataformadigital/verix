-- Expand supported Portuguese registration formats for machinery and trailers.
CREATE OR REPLACE FUNCTION public.verix_portuguese_plate_base_valid(p_raw text)
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
  IF v ~ '^[A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{2}$'
     OR v ~ '^[0-9]{2}[ -]?[0-9]{2}[ -]?[A-Z]{2}$'
     OR v ~ '^[0-9]{2}[ -]?[A-Z]{2}[ -]?[0-9]{2}$' THEN
    RETURN true;
  END IF;
  m := regexp_match(v, '^([A-Z]{2})[ -]?[0-9]{2}[ -]?([A-Z]{2})$');
  IF m IS NULL THEN RETURN false; END IF;
  IF m[1] IN ('AA', 'EE', 'II', 'OO', 'UU')
     OR m[2] IN ('AA', 'EE', 'II', 'OO', 'UU') THEN
    RETURN true;
  END IF;
  RETURN substring(m[1] from 2 for 1) NOT IN ('A', 'E', 'I', 'O', 'U')
     AND substring(m[2] from 2 for 1) NOT IN ('A', 'E', 'I', 'O', 'U');
END;
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
  m := regexp_match(v, '^(.+?)[ -]?([A-H])$');
  IF m IS NOT NULL AND public.verix_portuguese_plate_base_valid(m[1]) THEN RETURN true; END IF;
  RETURN v ~ '^(AV|BE|BN|BR|CB|FA|GD|LE|PT|SA|SE|VC|VR|VI|AN|H|A|M|L|P|C|E)[ -]?[0-9]{1,6}$';
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_portuguese_plate_base_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix_portuguese_plate_format_valid(text) FROM PUBLIC, anon, authenticated;
