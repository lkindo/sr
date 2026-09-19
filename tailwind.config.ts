import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          // 브랜드 액센트 블루 — 강조 표시(점·막대) 전용. hover/focus 배경에는 쓰지 않는다(대비 미달).
          blue: 'hsl(var(--accent-blue))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          solid: 'hsl(var(--destructive-solid))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // SR 상태·우선순위·마감 배지의 의미색(결정 D16 2단계). 값과 대비 근거는 globals.css.
        status: {
          neutral: 'hsl(var(--status-neutral))',
          'neutral-border': 'hsl(var(--status-neutral-border))',
          info: 'hsl(var(--status-info))',
          success: 'hsl(var(--status-success))',
          'success-solid': 'hsl(var(--status-success-solid))',
          warning: 'hsl(var(--status-warning))',
          caution: 'hsl(var(--status-caution))',
          danger: 'hsl(var(--status-danger))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'card-sm': '8px',
        'card-md': '12px',
        'card-lg': '16px',
        // DESIGN.md 의 Framer radius·자간 스케일(framer-*)은 정의만 있고 쓰는 곳이 없어 걷어냈다(2026-09-18 결정 D16 —
        // 치수의 정본은 fe-rules §3 과 이 파일이다).
      },
      boxShadow: {
        xs: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
        sm: '0px 4px 6px 0px rgba(0, 0, 0, 0.05)',
        md: '0px 10px 15px 0px rgba(0, 0, 0, 0.1), 0px 4px 6px 0px rgba(0, 0, 0, 0.05)',
        lg: '0px 20px 25px 0px rgba(0, 0, 0, 0.05)',
        xl: '0px 25px 50px 0px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
