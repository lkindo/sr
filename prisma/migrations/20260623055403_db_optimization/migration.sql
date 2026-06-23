/*
  Warnings:

  - The primary key for the `accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `client_handlers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `client_handlers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `client_id` on the `client_handlers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `client_handlers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `mattermost_id` on the `client_handlers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `backup_handler_id` on the `client_handlers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `clients` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `code` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `name` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `industry` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `contact_person` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `contact_email` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `contact_phone` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `address` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - The primary key for the `notification_preferences` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `notification_preferences` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `notification_preferences` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `notifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `notifications` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `subject` on the `notifications` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `fail_reason` on the `notifications` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `resource` on the `permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `action` on the `permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `description` on the `permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `push_subscriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `push_subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `push_subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `role_permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `role_permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `role_id` on the `role_permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `permission_id` on the `role_permissions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `roles` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `name` on the `roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `description` on the `roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `service_categories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `client_id` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `category_name` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `description` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `handler_id` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `backup_handler_id` on the `service_categories` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `sessions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `session_token` on the `sessions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `user_id` on the `sessions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `sr_activities` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `sr_activities` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `sr_id` on the `sr_activities` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `sr_activities` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `sr_attachments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `sr_id` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `file_name` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `file_type` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `file_url` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1024)`.
  - You are about to alter the column `storage_path` on the `sr_attachments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1024)`.
  - The primary key for the `sr_comments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `sr_comments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `sr_id` on the `sr_comments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `sr_comments` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `sr_status_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `sr_status_history` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `sr_id` on the `sr_status_history` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `changed_by` on the `sr_status_history` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `srs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `title` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `client_id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `requester_id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `assignee_id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `service_category_id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `intake_by_id` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `estimated_hours` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `satisfaction_rating` on the `srs` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `SmallInt`.
  - The primary key for the `user_clients` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `user_clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `user_clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `client_id` on the `user_clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `user_roles` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `user_roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `user_id` on the `user_roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `role_id` on the `user_roles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `email` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `name` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `password` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `image` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1024)`.
  - You are about to alter the column `identifier` on the `verification_tokens` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `token` on the `verification_tokens` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "client_handlers" DROP CONSTRAINT "client_handlers_backup_handler_id_fkey";

-- DropForeignKey
ALTER TABLE "client_handlers" DROP CONSTRAINT "client_handlers_client_id_fkey";

-- DropForeignKey
ALTER TABLE "client_handlers" DROP CONSTRAINT "client_handlers_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_backup_handler_id_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_client_id_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_handler_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_activities" DROP CONSTRAINT "sr_activities_sr_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_activities" DROP CONSTRAINT "sr_activities_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_attachments" DROP CONSTRAINT "sr_attachments_sr_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_comments" DROP CONSTRAINT "sr_comments_sr_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_comments" DROP CONSTRAINT "sr_comments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sr_status_history" DROP CONSTRAINT "sr_status_history_changed_by_fkey";

-- DropForeignKey
ALTER TABLE "sr_status_history" DROP CONSTRAINT "sr_status_history_sr_id_fkey";

-- DropForeignKey
ALTER TABLE "srs" DROP CONSTRAINT "srs_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "srs" DROP CONSTRAINT "srs_client_id_fkey";

-- DropForeignKey
ALTER TABLE "srs" DROP CONSTRAINT "srs_intake_by_id_fkey";

-- DropForeignKey
ALTER TABLE "srs" DROP CONSTRAINT "srs_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "srs" DROP CONSTRAINT "srs_service_category_id_fkey";

-- DropForeignKey
ALTER TABLE "user_clients" DROP CONSTRAINT "user_clients_client_id_fkey";

-- DropForeignKey
ALTER TABLE "user_clients" DROP CONSTRAINT "user_clients_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";

-- DropIndex
DROP INDEX "client_handlers_client_id_idx";

-- DropIndex
DROP INDEX "role_permissions_role_id_idx";

-- DropIndex
DROP INDEX "srs_sr_number_idx";

-- DropIndex
DROP INDEX "user_clients_user_id_idx";

-- DropIndex
DROP INDEX "user_roles_user_id_idx";

-- AlterTable
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "client_handlers" DROP CONSTRAINT "client_handlers_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "client_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "mattermost_id" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "backup_handler_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "assigned_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "unassigned_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "client_handlers_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "clients" DROP CONSTRAINT "clients_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "code" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "industry" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "contact_person" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "contact_email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "contact_phone" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "address" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "contract_start_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "contract_end_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "subject" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "fail_reason" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "resource" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "action" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "role_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "permission_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "roles" DROP CONSTRAINT "roles_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "client_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "category_name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "handler_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "backup_handler_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "session_token" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "expires" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sr_activities" DROP CONSTRAINT "sr_activities_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "sr_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "sr_activities_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sr_attachments" DROP CONSTRAINT "sr_attachments_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "sr_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "file_name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "file_size" SET DATA TYPE BIGINT,
ALTER COLUMN "file_type" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "file_url" SET DATA TYPE VARCHAR(1024),
ALTER COLUMN "storage_path" SET DATA TYPE VARCHAR(1024),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "sr_attachments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sr_comments" DROP CONSTRAINT "sr_comments_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "sr_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "sr_comments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sr_status_history" DROP CONSTRAINT "sr_status_history_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "sr_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "changed_by" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "changed_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "sr_status_history_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "srs" DROP CONSTRAINT "srs_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "title" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "requested_completion_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "client_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "requester_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "assignee_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "service_category_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "intake_by_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "estimated_hours" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "estimated_completion_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "requested_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "intake_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "due_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "expected_completion_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "actual_completion_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "satisfaction_rating" SET DATA TYPE SMALLINT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "srs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user_clients" DROP CONSTRAINT "user_clients_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "client_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "user_clients_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "role_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "email_verified" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "image" SET DATA TYPE VARCHAR(1024),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "verification_tokens" ALTER COLUMN "identifier" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "token" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "expires" SET DATA TYPE TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "sr_sequences" (
    "date" VARCHAR(10) NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "sr_sequences_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30),
    "action_type" VARCHAR(50) NOT NULL,
    "target_entity" VARCHAR(50) NOT NULL,
    "target_id" TEXT,
    "changes" JSONB NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_idx" ON "audit_logs"("action_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications"("recipient", "created_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clients" ADD CONSTRAINT "user_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clients" ADD CONSTRAINT "user_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_handlers" ADD CONSTRAINT "client_handlers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_handlers" ADD CONSTRAINT "client_handlers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_handlers" ADD CONSTRAINT "client_handlers_backup_handler_id_fkey" FOREIGN KEY ("backup_handler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "srs" ADD CONSTRAINT "srs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "srs" ADD CONSTRAINT "srs_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "srs" ADD CONSTRAINT "srs_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "srs" ADD CONSTRAINT "srs_intake_by_id_fkey" FOREIGN KEY ("intake_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "srs" ADD CONSTRAINT "srs_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_activities" ADD CONSTRAINT "sr_activities_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_activities" ADD CONSTRAINT "sr_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_comments" ADD CONSTRAINT "sr_comments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_comments" ADD CONSTRAINT "sr_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_attachments" ADD CONSTRAINT "sr_attachments_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_status_history" ADD CONSTRAINT "sr_status_history_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sr_status_history" ADD CONSTRAINT "sr_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
