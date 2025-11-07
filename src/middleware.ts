export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/srs/:path*",
    "/clients/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
