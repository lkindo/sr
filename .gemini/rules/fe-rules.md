# 🎨 기술 규칙: 프론트엔드 (fe-rules.md)

본 문서는 프론트엔드 레이어(Next.js App Router, Tailwind CSS, Storybook)와 관련된 기술 헌법 및 WOW UI 스타일 가이드이다.

---

## 1. Next.js App Router 아키텍처 규칙

- **서버 컴포넌트 우선 (Server Components First)**: 데이터 페칭 및 민감한 로직을 수행하는 모든 컴포넌트는 기본적으로 React Server Component(RSC)로 설계한다.
- **클라이언트 컴포넌트 최소화**: 사용자 인터랙션(이벤트 핸들러, `useState`, `useEffect` 등)이 꼭 필요한 단말 리프(Leaf) 컴포넌트에 한해서만 파일 최상단에 `"use client"`를 선언하여 Client Component로 설계한다.
- **경계 분리**: 데이터 조회 로직이 담긴 서버 컴포넌트 내부에 클라이언트 컴포넌트를 자식(Children)이나 Props 형태로 주입하여 성능과 데이터 로딩을 효율화한다.

---

## 2. Tailwind CSS 및 스타일링 규칙

- **cn 유틸리티 필수 적용**: 동적인 클래스 네임 조합이나 조건부 스타일링을 적용할 때, 클래스 중복 및 충돌을 방지하기 위해 [tailwind-merge](file:///d:/project/sr/package.json)와 [clsx](file:///d:/project/sr/package.json)가 래핑된 `cn(...)` 함수를 항상 사용하여 스타일을 조합한다.
- **반응형 웹 디자인**: UI는 모바일 디바이스부터 대형 모니터까지 완벽하게 대응하도록 Flexbox, Grid 및 Tailwind의 반응형 접두사(`sm:`, `md:`, `lg:`, `xl:`)를 적절히 활용하여 마크업한다.

---

## 3. Antigravity 프리미엄 WOW UI 철학

사용자가 처음 웹 어플리케이션에 접속했을 때 시각적인 감동(WOW)을 느낄 수 있도록 아래의 고수준 디자인 표준을 적용한다.

- **Harmony Color Palette**: 브라우저 기본 색상(순수 Red, Blue, Green 등)의 사용을 금지한다. 테일윈드 설정 파일([tailwind.config.ts](file:///d:/project/sr/tailwind.config.ts))에 지정된 HSL 커스텀 테마 색상(예: sleek 다크 모드용 slate-900, 진주빛 아크릴용 무채색 및 정교한 포인트 컬러)을 활용한다.
- **글래스모피즘 (Glassmorphism)**: 대시보드 카드, 모달, 네비게이션 바 등 주요 컨테이너 레이아웃에는 반투명 배경(`bg-white/10` 또는 `bg-black/30`), 백드롭 블러(`backdrop-blur-md`), 미세한 외곽선 테두리(`border border-white/20`)를 조합하여 깊이감을 극대화한다.
- **부드러운 그라데이션**: 텍스트 타이틀이나 핵심 버튼, 하이라이트 영역에는 세련된 메탈릭 그라데이션 또는 은은한 파스텔톤 그라데이션(`bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500`)을 적용하여 고급스러운 품질을 유지한다.
- **마이크로 애니메이션 & Hover 효과**:
  - 클릭 가능한 모든 인터랙티브 요소에는 `transition-all duration-300 ease-in-out`을 기본 적용한다.
  - 마우스 호버 시 미세한 리프트 업(`hover:-translate-y-0.5`), 스케일 조정(`hover:scale-[1.02]`), 그림자 깊이 변화(`hover:shadow-lg`) 및 글로우 효과(Glow effect)를 주어 화면이 살아 움직이는 듯한 입체감을 준다.
- **고급 타이포그래피**: 텍스트의 성격과 크기에 따라 최적화된 서체 계층구조를 유지하고, 테일윈드 기본 sans-serif 및 시스템 폰트 패밀리(맑은 고딕, Apple SD Gothic Neo, system-ui 등)를 기반으로 가독성을 확보한다. 향후 필요에 따라 `next/font/google`을 활용하여 Outfit, Inter, Roboto 등의 모던 기하학 서체를 프로젝트 전체에 주입해 확장할 수 있도록 설계한다.

---

## 4. Storybook 및 컴포넌트 재사용 규칙

- **독립적 UI 개발**: 주요 공통 UI 컴포넌트(Button, Select, Modal, Input 등)는 반드시 Storybook 스토리북 스토리 파일(`*.stories.tsx`)을 작성하여 컴포넌트 단위로 격리 검증이 가능하도록 설계한다.
- **Props 타입 안전성**: 컴포넌트의 모든 인터페이스는 TypeScript의 `interface` 또는 `type`으로 정의하며, Storybook의 Control 패널을 통해 다양한 속성이 실시간 변경되는지 검증이 가능해야 한다.
