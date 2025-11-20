import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const authProxy = NextAuth(authConfig).auth

export default authProxy

export const config = {
	matcher: [
		"/dashboard/:path*",
		"/srs/:path*",
		"/clients/:path*",
		"/users/:path*",
		"/roles/:path*",
		"/settings/:path*",
	],
}

