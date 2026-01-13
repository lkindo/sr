-- SR Management System - Seed Data
-- 이 SQL을 Supabase SQL Editor에서 실행하세요

-- ============================================================================
-- 권한 데이터 (31개)
-- ============================================================================

-- SR 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_sr_create', 'SR', 'CREATE', 'SR 생성'),
('perm_sr_read', 'SR', 'READ', 'SR 조회'),
('perm_sr_update', 'SR', 'UPDATE', 'SR 수정'),
('perm_sr_delete', 'SR', 'DELETE', 'SR 삭제'),
('perm_sr_assign', 'SR', 'ASSIGN', 'SR 할당'),
('perm_sr_complete', 'SR', 'COMPLETE', 'SR 완료'),
('perm_sr_confirm', 'SR', 'CONFIRM', 'SR 확인'),
('perm_sr_reject', 'SR', 'REJECT', 'SR 거부')
ON CONFLICT (resource, action) DO NOTHING;

-- CLIENT 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_client_create', 'CLIENT', 'CREATE', '고객사 생성'),
('perm_client_read', 'CLIENT', 'READ', '고객사 조회'),
('perm_client_update', 'CLIENT', 'UPDATE', '고객사 수정'),
('perm_client_delete', 'CLIENT', 'DELETE', '고객사 삭제'),
('perm_client_manage_users', 'CLIENT', 'MANAGE_USERS', '고객사 사용자 관리')
ON CONFLICT (resource, action) DO NOTHING;

-- USER 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_user_create', 'USER', 'CREATE', '사용자 생성'),
('perm_user_read', 'USER', 'READ', '사용자 조회'),
('perm_user_update', 'USER', 'UPDATE', '사용자 수정'),
('perm_user_delete', 'USER', 'DELETE', '사용자 삭제'),
('perm_user_manage_roles', 'USER', 'MANAGE_ROLES', '사용자 역할 관리')
ON CONFLICT (resource, action) DO NOTHING;

-- ROLE 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_role_create', 'ROLE', 'CREATE', '역할 생성'),
('perm_role_read', 'ROLE', 'READ', '역할 조회'),
('perm_role_update', 'ROLE', 'UPDATE', '역할 수정'),
('perm_role_delete', 'ROLE', 'DELETE', '역할 삭제'),
('perm_role_manage_perms', 'ROLE', 'MANAGE_PERMISSIONS', '역할 권한 관리')
ON CONFLICT (resource, action) DO NOTHING;

-- COMMENT 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_comment_create', 'COMMENT', 'CREATE', '댓글 생성'),
('perm_comment_read', 'COMMENT', 'READ', '댓글 조회'),
('perm_comment_update', 'COMMENT', 'UPDATE', '댓글 수정'),
('perm_comment_delete', 'COMMENT', 'DELETE', '댓글 삭제')
ON CONFLICT (resource, action) DO NOTHING;

-- ATTACHMENT 권한
INSERT INTO permissions (id, resource, action, description) VALUES
('perm_attachment_upload', 'ATTACHMENT', 'UPLOAD', '파일 업로드'),
('perm_attachment_download', 'ATTACHMENT', 'DOWNLOAD', '파일 다운로드'),
('perm_attachment_delete', 'ATTACHMENT', 'DELETE', '파일 삭제')
ON CONFLICT (resource, action) DO NOTHING;

-- ============================================================================
-- 역할 데이터 (5개)
-- ============================================================================

INSERT INTO roles (id, name, description) VALUES
('role_admin', 'ADMIN', '시스템 관리자 - 모든 권한'),
('role_manager', 'MANAGER', '매니저 - SR 관리 및 사용자 관리'),
('role_engineer', 'ENGINEER', '엔지니어 - SR 처리'),
('role_client_admin', 'CLIENT_ADMIN', '고객사 관리자 - 자사 SR 관리'),
('role_client_user', 'CLIENT_USER', '고객사 사용자 - SR 생성 및 조회')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 역할-권한 매핑
-- ============================================================================

-- ADMIN: 모든 권한
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT
    'rp_admin_' || p.id,
    'role_admin',
    p.id
FROM permissions p
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGER: SR 관리, 사용자 관리, 고객사 관리
INSERT INTO role_permissions (id, role_id, permission_id) VALUES
('rp_mgr_sr_create', 'role_manager', 'perm_sr_create'),
('rp_mgr_sr_read', 'role_manager', 'perm_sr_read'),
('rp_mgr_sr_update', 'role_manager', 'perm_sr_update'),
('rp_mgr_sr_assign', 'role_manager', 'perm_sr_assign'),
('rp_mgr_sr_complete', 'role_manager', 'perm_sr_complete'),
('rp_mgr_sr_confirm', 'role_manager', 'perm_sr_confirm'),
('rp_mgr_sr_reject', 'role_manager', 'perm_sr_reject'),
('rp_mgr_client_create', 'role_manager', 'perm_client_create'),
('rp_mgr_client_read', 'role_manager', 'perm_client_read'),
('rp_mgr_client_update', 'role_manager', 'perm_client_update'),
('rp_mgr_client_manage_users', 'role_manager', 'perm_client_manage_users'),
('rp_mgr_user_create', 'role_manager', 'perm_user_create'),
('rp_mgr_user_read', 'role_manager', 'perm_user_read'),
('rp_mgr_user_update', 'role_manager', 'perm_user_update'),
('rp_mgr_user_manage_roles', 'role_manager', 'perm_user_manage_roles'),
('rp_mgr_comment_create', 'role_manager', 'perm_comment_create'),
('rp_mgr_comment_read', 'role_manager', 'perm_comment_read'),
('rp_mgr_comment_delete', 'role_manager', 'perm_comment_delete'),
('rp_mgr_attachment_upload', 'role_manager', 'perm_attachment_upload'),
('rp_mgr_attachment_download', 'role_manager', 'perm_attachment_download'),
('rp_mgr_attachment_delete', 'role_manager', 'perm_attachment_delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ENGINEER: SR 처리
INSERT INTO role_permissions (id, role_id, permission_id) VALUES
('rp_eng_sr_read', 'role_engineer', 'perm_sr_read'),
('rp_eng_sr_update', 'role_engineer', 'perm_sr_update'),
('rp_eng_sr_complete', 'role_engineer', 'perm_sr_complete'),
('rp_eng_client_read', 'role_engineer', 'perm_client_read'),
('rp_eng_comment_create', 'role_engineer', 'perm_comment_create'),
('rp_eng_comment_read', 'role_engineer', 'perm_comment_read'),
('rp_eng_attachment_upload', 'role_engineer', 'perm_attachment_upload'),
('rp_eng_attachment_download', 'role_engineer', 'perm_attachment_download')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- CLIENT_ADMIN: 자사 SR 관리
INSERT INTO role_permissions (id, role_id, permission_id) VALUES
('rp_ca_sr_create', 'role_client_admin', 'perm_sr_create'),
('rp_ca_sr_read', 'role_client_admin', 'perm_sr_read'),
('rp_ca_sr_update', 'role_client_admin', 'perm_sr_update'),
('rp_ca_sr_confirm', 'role_client_admin', 'perm_sr_confirm'),
('rp_ca_client_read', 'role_client_admin', 'perm_client_read'),
('rp_ca_comment_create', 'role_client_admin', 'perm_comment_create'),
('rp_ca_comment_read', 'role_client_admin', 'perm_comment_read'),
('rp_ca_attachment_upload', 'role_client_admin', 'perm_attachment_upload'),
('rp_ca_attachment_download', 'role_client_admin', 'perm_attachment_download')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- CLIENT_USER: SR 생성 및 조회
INSERT INTO role_permissions (id, role_id, permission_id) VALUES
('rp_cu_sr_create', 'role_client_user', 'perm_sr_create'),
('rp_cu_sr_read', 'role_client_user', 'perm_sr_read'),
('rp_cu_comment_create', 'role_client_user', 'perm_comment_create'),
('rp_cu_comment_read', 'role_client_user', 'perm_comment_read'),
('rp_cu_attachment_upload', 'role_client_user', 'perm_attachment_upload'),
('rp_cu_attachment_download', 'role_client_user', 'perm_attachment_download')
ON CONFLICT (role_id, permission_id) DO NOTHING;
