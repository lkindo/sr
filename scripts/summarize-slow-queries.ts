import { readFileSync } from 'fs'
import { resolve } from 'path'

/*
Usage:
  PRISMA_SLOW_LOG_FILE=.refactor-metrics/prisma_slow.log pnpm run report:slow-queries
*/

function parse(line: string) {
	// [Prisma][SlowQuery] Model.action 123ms
	const m = line.match(/SlowQuery\]\s+([A-Za-z0-9_]+)\.([a-zA-Z]+)\s+(\d+)ms/)
	if (!m) return null
	return { model: m[1], action: m[2], ms: Number(m[3]) }
}

function main() {
	const file = process.env.PRISMA_SLOW_LOG_FILE || '.refactor-metrics/prisma_slow.log'
	const path = resolve(process.cwd(), file)
	const content = readFileSync(path, 'utf8')
	const lines = content.split(/\r?\n/).filter(Boolean)

	type Stat = { count: number; totalMs: number; p95Ms?: number }
	const byAction = new Map<string, Stat>()
	const samples: number[] = []

	for (const line of lines) {
		const rec = parse(line)
		if (!rec) continue
		const key = `${rec.model}.${rec.action}`
		const stat = byAction.get(key) ?? { count: 0, totalMs: 0 }
		stat.count += 1
		stat.totalMs += rec.ms
		byAction.set(key, stat)
		samples.push(rec.ms)
	}

	const sorted = [...byAction.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs)
	const p95 = percentile(samples, 95)

	console.log('=== Prisma Slow Query Summary ===')
	console.log(`Records: ${samples.length}, p95: ${p95.toFixed(0)}ms`)
	for (const [key, s] of sorted.slice(0, 10)) {
		const avg = s.totalMs / s.count
		console.log(`${key} -> count=${s.count}, avg=${avg.toFixed(1)}ms, total=${s.totalMs}ms`)
	}
}

function percentile(nums: number[], p: number): number {
	if (nums.length === 0) return 0
	const arr = nums.slice().sort((a, b) => a - b)
	const idx = Math.ceil((p / 100) * arr.length) - 1
	return arr[Math.max(0, Math.min(idx, arr.length - 1))]
}

main()

