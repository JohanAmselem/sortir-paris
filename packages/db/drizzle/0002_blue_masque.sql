CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"image_alt" text,
	"type" text NOT NULL,
	"category" text,
	"meta_title" text,
	"meta_description" text,
	"keywords" text,
	"priority" smallint DEFAULT 5 NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"tags" text,
	"related_event_ids" text,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" text DEFAULT 'manual',
	"source_urls" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "idx_articles_slug" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_articles_published" ON "articles" USING btree ("published_at") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "idx_articles_type" ON "articles" USING btree ("type") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "idx_articles_priority" ON "articles" USING btree ("priority","published_at");