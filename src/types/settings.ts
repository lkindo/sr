// 시스템 설정 타입 정의
export interface SystemSettings {
  siteName?: string;
  siteDescription?: string;
  adminEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecurity?: string;
  sessionTimeout?: number;
  passwordPolicy?: string;
  databaseBackupTime?: string;
  cacheStatus?: string;
}
