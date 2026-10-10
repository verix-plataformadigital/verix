-- Include official diplomatic/consular and export series in syntactic plate validation.
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

  -- Industrial machinery uses a regular registration plus class A-H.
  m := regexp_match(v, '^(.+?)[ -]?([A-H])$');
  IF m IS NOT NULL AND public.verix_portuguese_plate_base_valid(m[1]) THEN RETURN true; END IF;

  -- Official MNE privileged registrations: mission digits, CD/CC/FM category, vehicle sequence.
  IF v ~ '^[0-9]{3}[ -](CD|CC|FM)[0-9]{3}$' THEN RETURN true; END IF;

  -- Export registrations use a sequence followed by the customs-office initial.
  IF v ~ '^[0-9]+[ -]?[LPAM]$' THEN RETURN true; END IF;

  -- Trailers/semi-trailers use an authorized regional service code followed by the number.
  RETURN v ~ '^(AV|BE|BN|BR|CB|FA|GD|LE|PT|SA|SE|VC|VR|VI|AN|H|A|M|L|P|C|E)[ -]?[0-9]{1,6}$';
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_portuguese_plate_format_valid(text) FROM PUBLIC, anon, authenticated;
