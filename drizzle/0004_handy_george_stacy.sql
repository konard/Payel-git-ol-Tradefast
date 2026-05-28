CREATE TABLE "source_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"source_title" text NOT NULL,
	"source_url" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"credibility_score" real DEFAULT 1 NOT NULL,
	"predictions_made" integer DEFAULT 0 NOT NULL,
	"predictions_correct" integer DEFAULT 0 NOT NULL,
	"loud_claims" integer DEFAULT 0 NOT NULL,
	"last_prediction_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "source_ratings_source_id_uq" ON "source_ratings" USING btree ("source_id");