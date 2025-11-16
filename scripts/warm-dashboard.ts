/**
 * Dashboard cache prewarmer (best-effort).
 * Note: Endpoints require auth; this script expects a BASE_URL and optional SESSION cookie.
 *
 * Usage (Windows PowerShell):
 *   $env:BASE_URL="http://localhost:3000"
 *   $env:SESSION_COOKIE="your_session_cookie_here"  # optional if public
 *   pnpm run warm:dashboard
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const SESSION_COOKIE = process.env.SESSION_COOKIE || ''
const WARM_PATHS = process.env.WARM_PATHS // comma-separated

async function fetchWithSession(path: string) {
	const headers: Record<string, string> = {}
	if (SESSION_COOKIE) headers['cookie'] = SESSION_COOKIE
	const res = await fetch(`${BASE_URL}${path}`, { headers })
	const ok = res.ok
	const text = await res.text().catch(() => '')
	console.log(`[warm] GET ${path} -> ${res.status} ${ok ? 'OK' : 'FAIL'}`)
	return { ok, text }
}

	async function main() {
	const targets = (WARM_PATHS
		? WARM_PATHS.split(',').map(s => s.trim()).filter(Boolean)
		: [
			'/api/srs?status=REQUESTED',
			'/api/srs?status=IN_PROGRESS',
			'/api/srs?status=COMPLETED',
			'/api/dashboard/stats',
		])
	for (const t of targets) {
		try { await fetchWithSession(t) } catch (e) { console.warn(`[warm] error on ${t}`, e) }
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})

