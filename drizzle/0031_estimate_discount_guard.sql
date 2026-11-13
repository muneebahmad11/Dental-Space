-- A charge billed from an accepted estimate must match it exactly: its full price is the accepted unit price
-- times the completed quantity, and any discount is exactly this item's share of the estimate's discount,
-- rounded to the nearest paisa the same way the app does (src/lib/plans/contracts.ts discountShare).
CREATE OR REPLACE FUNCTION clinic_app.check_treatment_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completion clinic_app.treatment_completions; snapshot jsonb; item jsonb; amount bigint; discount bigint; gross bigint; plan_discount bigint; plan_subtotal bigint; share bigint;
BEGIN
 SELECT * INTO completion FROM clinic_app.treatment_completions WHERE id=NEW.completion_id;
 SELECT v.snapshot INTO snapshot FROM clinic_app.plan_versions v WHERE v.plan_id=completion.plan_id AND v.version=completion.version;
 SELECT element INTO item FROM jsonb_array_elements(snapshot->'items') element WHERE element->>'id'=completion.item_id::text;
 SELECT amount_minor, discount_minor INTO amount, discount FROM clinic_app.charges WHERE id=NEW.charge_id;
 IF item IS NULL THEN RAISE EXCEPTION 'Charge must match the accepted treatment price'; END IF;
 gross := (item->>'unitPriceMinor')::bigint*completion.quantity;
 plan_discount := coalesce((snapshot->>'discountMinor')::bigint, 0);
 plan_subtotal := coalesce((snapshot->>'subtotalMinor')::bigint, (snapshot->>'totalMinor')::bigint);
 share := 0;
 IF plan_discount > 0 AND plan_subtotal > 0 AND gross > 0 THEN
  share := (gross*plan_discount*2 + plan_subtotal) / (plan_subtotal*2);
  IF share >= gross THEN share := gross - 1; END IF;
 END IF;
 IF amount IS DISTINCT FROM gross - share OR discount IS DISTINCT FROM share THEN RAISE EXCEPTION 'Charge must match the accepted treatment price'; END IF;
 RETURN NEW;
END $$;
