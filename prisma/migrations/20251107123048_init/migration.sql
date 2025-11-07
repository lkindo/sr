-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email_verified" DATETIME,
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    CONSTRAINT "permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "contract_start_date" DATETIME,
    "contract_end_date" DATETIME,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "description" TEXT,
    "sla_hours" INTEGER NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "handler_id" TEXT,
    "backup_handler_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "service_categories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_categories_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "service_categories_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_handlers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mattermost_id" TEXT,
    "backup_handler_id" TEXT,
    "assigned_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "client_handlers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_handlers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_handlers_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "srs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "client_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "service_category_id" TEXT NOT NULL,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intake_at" DATETIME,
    "completed_at" DATETIME,
    "confirmed_at" DATETIME,
    "due_date" DATETIME,
    "expected_completion_date" DATETIME,
    "actual_completion_date" DATETIME,
    "resolution_description" TEXT,
    "rejection_reason" TEXT,
    "satisfaction_rating" INTEGER,
    "additional_feedback" TEXT,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "srs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "srs_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "srs_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "srs_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sr_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_activities_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sr_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sr_comments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sr_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_attachments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sent_at" DATETIME,
    "fail_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sr_status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "previous_status" TEXT,
    "current_status" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "change_reason" TEXT,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_status_history_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "permissions_role_id_idx" ON "permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_role_id_resource_action_key" ON "permissions"("role_id", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_code_idx" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_is_active_idx" ON "clients"("is_active");

-- CreateIndex
CREATE INDEX "user_clients_user_id_idx" ON "user_clients"("user_id");

-- CreateIndex
CREATE INDEX "user_clients_client_id_idx" ON "user_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_clients_user_id_client_id_key" ON "user_clients"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "service_categories_client_id_idx" ON "service_categories"("client_id");

-- CreateIndex
CREATE INDEX "service_categories_handler_id_idx" ON "service_categories"("handler_id");

-- CreateIndex
CREATE INDEX "client_handlers_client_id_idx" ON "client_handlers"("client_id");

-- CreateIndex
CREATE INDEX "client_handlers_user_id_idx" ON "client_handlers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_handlers_client_id_user_id_key" ON "client_handlers"("client_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "srs_sr_number_key" ON "srs"("sr_number");

-- CreateIndex
CREATE INDEX "srs_client_id_status_idx" ON "srs"("client_id", "status");

-- CreateIndex
CREATE INDEX "srs_requester_id_created_at_idx" ON "srs"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "srs_assignee_id_status_idx" ON "srs"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "srs_service_category_id_idx" ON "srs"("service_category_id");

-- CreateIndex
CREATE INDEX "srs_sr_number_idx" ON "srs"("sr_number");

-- CreateIndex
CREATE INDEX "srs_status_priority_created_at_idx" ON "srs"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "sr_activities_sr_id_created_at_idx" ON "sr_activities"("sr_id", "created_at");

-- CreateIndex
CREATE INDEX "sr_activities_user_id_idx" ON "sr_activities"("user_id");

-- CreateIndex
CREATE INDEX "sr_comments_sr_id_created_at_idx" ON "sr_comments"("sr_id", "created_at");

-- CreateIndex
CREATE INDEX "sr_comments_user_id_idx" ON "sr_comments"("user_id");

-- CreateIndex
CREATE INDEX "sr_attachments_sr_id_idx" ON "sr_attachments"("sr_id");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_idx" ON "notifications"("recipient");

-- CreateIndex
CREATE INDEX "sr_status_history_sr_id_changed_at_idx" ON "sr_status_history"("sr_id", "changed_at");

-- CreateIndex
CREATE INDEX "sr_status_history_changed_by_idx" ON "sr_status_history"("changed_by");
