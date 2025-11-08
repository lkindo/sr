-- SR Management System - Supabase Database Schema
-- 이 SQL을 Supabase SQL Editor에서 실행하세요

-- ============================================================================
-- 인증 및 사용자 관리
-- ============================================================================

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "accounts" (
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
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accounts_provider_provider_account_id_key" UNIQUE ("provider", "provider_account_id")
);

CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_token" TEXT NOT NULL UNIQUE,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_tokens_identifier_token_key" UNIQUE ("identifier", "token")
);

-- ============================================================================
-- 권한 관리 (RBAC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_user_id_role_id_key" UNIQUE ("user_id", "role_id")
);

CREATE TABLE IF NOT EXISTS "permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "permissions_resource_action_key" UNIQUE ("resource", "action")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_role_id_permission_id_key" UNIQUE ("role_id", "permission_id")
);

-- ============================================================================
-- 고객사 관리
-- ============================================================================

CREATE TABLE IF NOT EXISTS "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "contract_start_date" TIMESTAMP(3),
    "contract_end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "user_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_clients_user_id_client_id_key" UNIQUE ("user_id", "client_id")
);

-- ============================================================================
-- SR 관리
-- ============================================================================

CREATE TYPE "SRStatus" AS ENUM ('REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED');
CREATE TYPE "SRPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "SRActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'REASSIGNED', 'COMMENTED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'REOPENED', 'COMPLETED', 'REJECTED');
CREATE TYPE "NotificationType" AS ENUM ('EMAIL', 'MATTERMOST', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE IF NOT EXISTS "service_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "description" TEXT,
    "sla_hours" INTEGER NOT NULL,
    "priority" "SRPriority" NOT NULL DEFAULT 'MEDIUM',
    "handler_id" TEXT,
    "backup_handler_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_categories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_categories_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "service_categories_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "client_handlers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mattermost_id" TEXT,
    "backup_handler_id" TEXT,
    "assigned_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_handlers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_handlers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_handlers_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_handlers_client_id_user_id_key" UNIQUE ("client_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "srs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_number" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SRStatus" NOT NULL DEFAULT 'REQUESTED',
    "priority" "SRPriority" NOT NULL DEFAULT 'MEDIUM',
    "client_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "service_category_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intake_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "expected_completion_date" TIMESTAMP(3),
    "actual_completion_date" TIMESTAMP(3),
    "resolution_description" TEXT,
    "rejection_reason" TEXT,
    "satisfaction_rating" INTEGER,
    "additional_feedback" TEXT,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "srs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "srs_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "srs_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "srs_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sr_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "SRActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_activities_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sr_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_comments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sr_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_attachments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sent_at" TIMESTAMP(3),
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sr_status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sr_id" TEXT NOT NULL,
    "previous_status" "SRStatus",
    "current_status" "SRStatus" NOT NULL,
    "changed_by" TEXT NOT NULL,
    "change_reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sr_status_history_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sr_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================================
-- 인덱스 생성
-- ============================================================================

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_is_active_idx" ON "users"("is_active");
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_roles_user_id_idx" ON "user_roles"("user_id");
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE INDEX IF NOT EXISTS "role_permissions_role_id_idx" ON "role_permissions"("role_id");
CREATE INDEX IF NOT EXISTS "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE INDEX IF NOT EXISTS "clients_name_idx" ON "clients"("name");
CREATE INDEX IF NOT EXISTS "clients_code_idx" ON "clients"("code");
CREATE INDEX IF NOT EXISTS "clients_is_active_idx" ON "clients"("is_active");
CREATE INDEX IF NOT EXISTS "user_clients_user_id_idx" ON "user_clients"("user_id");
CREATE INDEX IF NOT EXISTS "user_clients_client_id_idx" ON "user_clients"("client_id");
CREATE INDEX IF NOT EXISTS "service_categories_client_id_idx" ON "service_categories"("client_id");
CREATE INDEX IF NOT EXISTS "service_categories_handler_id_idx" ON "service_categories"("handler_id");
CREATE INDEX IF NOT EXISTS "client_handlers_client_id_idx" ON "client_handlers"("client_id");
CREATE INDEX IF NOT EXISTS "client_handlers_user_id_idx" ON "client_handlers"("user_id");
CREATE INDEX IF NOT EXISTS "srs_client_id_status_idx" ON "srs"("client_id", "status");
CREATE INDEX IF NOT EXISTS "srs_requester_id_created_at_idx" ON "srs"("requester_id", "created_at");
CREATE INDEX IF NOT EXISTS "srs_assignee_id_status_idx" ON "srs"("assignee_id", "status");
CREATE INDEX IF NOT EXISTS "srs_service_category_id_idx" ON "srs"("service_category_id");
CREATE INDEX IF NOT EXISTS "srs_sr_number_idx" ON "srs"("sr_number");
CREATE INDEX IF NOT EXISTS "srs_status_priority_created_at_idx" ON "srs"("status", "priority", "created_at");
CREATE INDEX IF NOT EXISTS "sr_activities_sr_id_created_at_idx" ON "sr_activities"("sr_id", "created_at");
CREATE INDEX IF NOT EXISTS "sr_activities_user_id_idx" ON "sr_activities"("user_id");
CREATE INDEX IF NOT EXISTS "sr_comments_sr_id_created_at_idx" ON "sr_comments"("sr_id", "created_at");
CREATE INDEX IF NOT EXISTS "sr_comments_user_id_idx" ON "sr_comments"("user_id");
CREATE INDEX IF NOT EXISTS "sr_attachments_sr_id_idx" ON "sr_attachments"("sr_id");
CREATE INDEX IF NOT EXISTS "notifications_status_created_at_idx" ON "notifications"("status", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications"("recipient");
CREATE INDEX IF NOT EXISTS "sr_status_history_sr_id_changed_at_idx" ON "sr_status_history"("sr_id", "changed_at");
CREATE INDEX IF NOT EXISTS "sr_status_history_changed_by_idx" ON "sr_status_history"("changed_by");
