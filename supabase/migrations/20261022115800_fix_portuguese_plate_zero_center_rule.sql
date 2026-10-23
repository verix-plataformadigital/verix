-- Correct the current-format plate rule used by Admin analytics.
-- The series starts at AA-01-AA because AA-00-AA was reserved. Later
-- letter combinations can use a central 00 block, so rejecting every 00
-- block incorrectly hides valid-format plates from error classifications.
CREATE OR REPLACE FUNCTION public.verix2_is_portuguese_plate_format(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v text := upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g'));
BEGIN
  -- Historical formats: AA-00-00, 00-00-AA and 00-AA-00.
  -- K, W and Y were excluded from these historic series.
  IF v ~ '^[A-JL-VXZ]{2}[0-9]{4}$'
     OR v ~ '^[0-9]{4}[A-JL-VXZ]{2}$'
     OR v ~ '^[0-9]{2}[A-JL-VXZ]{2}[0-9]{2}$' THEN
    RETURN true;
  END IF;

  -- Format introduced in March 2020: AA-01-AA.
  -- Only AA-00-AA is reserved; 00 can occur in later letter combinations.
  IF v !~ '^[A-Z]{2}[0-9]{2}[A-Z]{2}$'
     OR v = 'AA00AA' THEN
    RETURN false;
  END IF;

  -- Do not use a vowel in positions 2 and 6 unless the respective
  -- two-letter group repeats that same vowel.
  IF substring(v FROM 2 FOR 1) ~ '^[AEIOU]$'
     AND substring(v FROM 1 FOR 1) <> substring(v FROM 2 FOR 1) THEN
    RETURN false;
  END IF;
  IF substring(v FROM 6 FOR 1) ~ '^[AEIOU]$'
     AND substring(v FROM 5 FOR 1) <> substring(v FROM 6 FOR 1) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- Migration-time regression tests; no production data is read or changed.
DO $block$
BEGIN
  IF NOT public.verix2_is_portuguese_plate_format('AA-00-00') THEN
    RAISE EXCEPTION 'historical AA-00-00 rejected';
  END IF;
  IF NOT public.verix2_is_portuguese_plate_format('00-00-AA') THEN
    RAISE EXCEPTION 'historical 00-00-AA rejected';
  END IF;
  IF NOT public.verix2_is_portuguese_plate_format('00-AA-00') THEN
    RAISE EXCEPTION 'historical 00-AA-00 rejected';
  END IF;
  IF NOT public.verix2_is_portuguese_plate_format('AA-01-AA') THEN
    RAISE EXCEPTION 'first current-format plate rejected';
  END IF;
  IF NOT public.verix2_is_portuguese_plate_format('AB-00-AA') THEN
    RAISE EXCEPTION 'valid later 00-center combination rejected';
  END IF;
  IF NOT public.verix2_is_portuguese_plate_format('AB-00-CD') THEN
    RAISE EXCEPTION 'valid-format nonreserved 00-center combination rejected';
  END IF;
  IF public.verix2_is_portuguese_plate_format('AA-00-AA') THEN
    RAISE EXCEPTION 'reserved AA-00-AA unexpectedly accepted';
  END IF;
  IF public.verix2_is_portuguese_plate_format('BA-00-AA') THEN
    RAISE EXCEPTION 'invalid vowel placement accepted';
  END IF;
  IF public.verix2_is_portuguese_plate_format('AB-12-AE') THEN
    RAISE EXCEPTION 'invalid vowel placement in final group accepted';
  END IF;
  IF public.verix2_is_portuguese_plate_format('1A-234-5') THEN
    RAISE EXCEPTION 'malformed plate accepted';
  END IF;
END;
$block$;
