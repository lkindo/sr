// src/app/api/settings/system/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { SystemSettings } from "@/types/settings";

// 시스템 설정 가져오기
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    // 관리자 권한 확인
    if (!session?.user || !session.user.roles?.includes('ADMIN')) {
      return new Response(
        JSON.stringify({ error: "관리자 권한이 필요합니다." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 실제 설정 정보는 데이터베이스나 환경변수에서 가져와야 합니다.
    // 현재는 더미 데이터로 표시
    const settings: SystemSettings = {
      siteName: process.env.SITE_NAME || "SR Management System",
      siteDescription: process.env.SITE_DESCRIPTION || "서비스 요청 관리 시스템",
      adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
      smtpHost: process.env.SMTP_HOST || "smtp.example.com",
      smtpPort: parseInt(process.env.SMTP_PORT || "587"),
      smtpSecurity: process.env.SMTP_SECURITY || "TLS",
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || "24"),
      passwordPolicy: process.env.PASSWORD_POLICY || "최소 6자, 영문/숫자 조합",
      databaseBackupTime: "2025-01-12 10:30",
      cacheStatus: "enabled",
    };

    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching system settings:", error);
    return new Response(
      JSON.stringify({ error: "서버 오류 발생" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// 시스템 설정 저장
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    // 관리자 권한 확인
    if (!session?.user || !session.user.roles?.includes('ADMIN')) {
      return new Response(
        JSON.stringify({ error: "관리자 권한이 필요합니다." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const settings: SystemSettings = await request.json();

    // 실제 설정 저장 로직은 여기에 구현해야 합니다.
    // 현재는 더미 응답
    console.log("Updating system settings:", settings);

    return new Response(
      JSON.stringify({ message: "시스템 설정이 저장되었습니다." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error updating system settings:", error);
    return new Response(
      JSON.stringify({ error: "서버 오류 발생" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}