import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { auth: session } = req;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
                     req.nextUrl.pathname.startsWith("/register");

  // 인증이 필요한 페이지에 접근했는데 세션이 없으면 로그인 페이지로
  if (!session && !isAuthPage) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 이미 로그인한 사용자가 로그인 페이지 접근 시 대시보드로
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/srs/:path*",
    "/clients/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
