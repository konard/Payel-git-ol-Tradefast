CREATE TABLE "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"source_title" text NOT NULL,
	"source_url" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"summary" text,
	"published_at" timestamp with time zone,
	"content_hash" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_source_title_uq" ON "news_items" USING btree ("source_id","title");--> statement-breakpoint
CREATE INDEX "news_items_source_idx" ON "news_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "news_items_fetched_at_idx" ON "news_items" USING btree ("fetched_at");