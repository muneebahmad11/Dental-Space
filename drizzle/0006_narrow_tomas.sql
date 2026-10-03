CREATE TABLE "clinic_app"."expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"method" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_operation_unique" UNIQUE("clinic_id","branch_id","operation_id"),
	CONSTRAINT "expenses_positive_amount" CHECK ("clinic_app"."expenses"."amount_minor" between 1 and 99999999),
	CONSTRAINT "expenses_description_valid" CHECK (length(trim("clinic_app"."expenses"."description")) between 1 and 240),
	CONSTRAINT "expenses_category_valid" CHECK ("clinic_app"."expenses"."category" in ('Supplies','Laboratory','Utilities','Maintenance','Other')),
	CONSTRAINT "expenses_method_valid" CHECK ("clinic_app"."expenses"."method" in ('Cash','Card','Bank transfer')),
	CONSTRAINT "expenses_currency_valid" CHECK ("clinic_app"."expenses"."currency" = 'PKR')
);
--> statement-breakpoint
ALTER TABLE "clinic_app"."expenses" ADD CONSTRAINT "expenses_clinic_id_branch_id_branches_clinic_id_id_fk" FOREIGN KEY ("clinic_id","branch_id") REFERENCES "clinic_app"."branches"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_app"."expenses" ADD CONSTRAINT "expenses_clinic_id_actor_membership_id_memberships_clinic_id_id_fk" FOREIGN KEY ("clinic_id","actor_membership_id") REFERENCES "clinic_app"."memberships"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_branch_date_idx" ON "clinic_app"."expenses" USING btree ("clinic_id","branch_id","paid_on");
--> statement-breakpoint
INSERT INTO clinic_app.permissions(key,description) VALUES
 ('expense.read','Read branch expenses'), ('expense.write','Record branch expenses');
--> statement-breakpoint
GRANT SELECT, INSERT ON clinic_app.expenses TO clinic_runtime;
--> statement-breakpoint
CREATE FUNCTION clinic_app.reject_expense_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Expense entries are append-only' USING ERRCODE = '42501'; END $$;
--> statement-breakpoint
CREATE TRIGGER expense_no_update_delete BEFORE UPDATE OR DELETE ON clinic_app.expenses
FOR EACH ROW EXECUTE FUNCTION clinic_app.reject_expense_mutation();
--> statement-breakpoint
CREATE TRIGGER expense_no_truncate BEFORE TRUNCATE ON clinic_app.expenses
FOR EACH STATEMENT EXECUTE FUNCTION clinic_app.reject_expense_mutation();
