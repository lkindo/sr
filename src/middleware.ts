import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/srs/:path*",
    "/clients/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/settings/:path*",
  ],
};
