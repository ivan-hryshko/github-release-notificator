CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"release_tag" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" varchar(255) NOT NULL,
	"repo" varchar(255) NOT NULL,
	"last_seen_tag" varchar(255),
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"repos_checked" integer DEFAULT 0 NOT NULL,
	"releases_found" integer DEFAULT 0 NOT NULL,
	"notifications_created" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"repository_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"confirm_token" varchar(64) NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_subscription_id_idx" ON "notifications" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_owner_repo_idx" ON "repositories" USING btree ("owner","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_repo_idx" ON "subscriptions" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "subscriptions_confirm_token_idx" ON "subscriptions" USING btree ("confirm_token");--> statement-breakpoint
CREATE INDEX "subscriptions_unsubscribe_token_idx" ON "subscriptions" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");