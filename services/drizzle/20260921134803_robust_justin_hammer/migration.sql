CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"threshold_count" integer NOT NULL,
	"threshold_window_minutes" integer NOT NULL,
	"webhook_url" text NOT NULL,
	"cooldown_period" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'active',
	"appName" text NOT NULL,
	"last_triggered" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_invoice_id" text NOT NULL UNIQUE,
	"status" text,
	"currency" text,
	"amount_due" bigint,
	"amount_paid" bigint,
	"hosted_invoice_url" text,
	"invoice_pdf" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
