CREATE TABLE "news_consensus" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument" varchar(50) NOT NULL,
	"mentions" integer DEFAULT 0 NOT NULL,
	"bullish" integer DEFAULT 0 NOT NULL,
	"bearish" integer DEFAULT 0 NOT NULL,
	"neutral" integer DEFAULT 0 NOT NULL,
	"crowd_bias" real NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_consensus_instrument_uq" ON "news_consensus" USING btree ("instrument");--> statement-breakpoint
CREATE INDEX "news_consensus_bias_idx" ON "news_consensus" USING btree ("crowd_bias");