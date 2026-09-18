# 🎨 기술 규칙: 프론트엔드 (fe-rules.md)

본 문서는 프론트엔드 레이어(Next.js App Router, Tailwind CSS)와 관련된 기술 헌법 및 UI 스타일 가이드이다.

> **디자인 정본 선언(2026-08-15, 2026-09-18 소유자 결정 D16 으로 범위를 좁힘)**: **색상 팔레트**(의미색 포함)의
> 정본은 **`docs/DESIGN.md`(다크 캔버스 체계)** 이고, 구현 진입점은 `src/app/globals.css`의 CSS 변수와
> `tailwind.config.ts`다. 본 문서는 색상 값을 복제하지 않는다. **치수**(radius·간격·폭)·타이포 크기·컴포넌트 규격의
> 정본은 본 문서 §3 과 그 구현(`globals.css`·`tailwind.config.ts`·`src/components/ui/`)이다. DESIGN.md 의
> rounded·spacing·typography 스케일과 status-badge·text-input 토큰은 마케팅 사이트 분석 원본의 값이라 참고 자료다.
> 상태·우선순위 배지의 variant 정본은 `src/lib/constants/sr.ts` 다(화면에 사본을 두지 않는다).
> 과거 이 문서가 규정하던 `SaaSify-UI-Kit` 라이트 인디고 팔레트는 **폐기한다** — 실측 결과
> 코드에 인디고 계열 사용은 0건이고 캔버스는 `#090909`다. 정본이 둘이던 동안 개발자가
> 라이트 스펙을 그대로 옮겨 적으면서 다크 화면 위 흰 글씨·흰 상자 같은 **판독 불가 UI**가
> 실제로 만들어졌다.

---

## 1. Next.js App Router 아키텍처 규칙

- **서버 컴포넌트 우선 (Server Components First)**: 데이터 페칭 및 민감한 로직을 수행하는 모든 컴포넌트는 기본적으로 React Server Component(RSC)로 설계한다.
- **클라이언트 컴포넌트 최소화**: 사용자 인터랙션(이벤트 핸들러, `useState`, `useEffect` 등)이 꼭 필요한 단말 리프(Leaf) 컴포넌트에 한해서만 파일 최상단에 `"use client"`를 선언하여 Client Component로 설계한다.
- **경계 분리**: 데이터 조회 로직이 담긴 서버 컴포넌트 내부에 클라이언트 컴포넌트를 자식(Children)이나 Props 형태로 주입하여 성능과 데이터 로딩을 효율화한다.

> ⚠️ **전환 진행 중 (2026-09-18 재실측)**: `(dashboard)` 하위 route page 17개 중 `'use client'` 가
> 없는 것은 4개(`srs`, `roles`, `users`, `settings`)지만, 서버에서 데이터를 채워 주입하는 **실질적
> 전환은 `srs`·`roles` 둘뿐**이다. `users/page.tsx` 는 `UsersClient` 를 `Suspense` 로 감싼 껍데기라
> 목록은 여전히 브라우저가 `/api/users` 로 가져오고, `settings/page.tsx` 는 리디렉트만 한다.
> 나머지는 최상단에 `'use client'` 를 달고 목록 전체를 브라우저에서 가져온다 — 열 때마다 스피너가
> 한 번 돌고 목록 로직이 번들에 실린다.
>
> **참조 구현**: `src/app/(dashboard)/roles/page.tsx` + `RolesClient.tsx`.
> 서버가 API 와 **같은 정책 함수**로 인가를 판정하고 서비스 계층을 직접 호출해
> `initialRoles` 로 주입하며, 클라이언트는 그것을 React Query `initialData` 로 받아
> 이후 무효화·재조회를 그대로 이어 간다. 인가 거부는 `null` 로 구분해 "빈 목록" 과
> 뒤섞이지 않게 한다.
>
> **남은 대상 (큰 것부터)**: `clients/[id]`, `organization`, `users`(`UsersClient`), `dashboard`,
> `users/[id]`, `my-requests`, `srs/[id]`, `clients`, `settings/profile`, `settings/notifications`,
> `company/users`, `settings/outbox`, `settings/system`, `srs/[id]/intake`.
> (줄 수는 적지 않는다 — 고칠 때마다 틀어진다. `wc -l` 로 다시 잰다.)
> `clients` 계열은 필터가 로컬 state 라 서버 렌더로 옮기려면 URL searchParams 로
> 먼저 올려야 한다(`srs/page.tsx` 가 그 형태다) — 동작 변경이 따르므로 별도 작업이다.

### 1.1. 파일명 및 배치 규칙

대소문자 비구분 파일시스템(Windows)에서는 잘못된 케이스의 import 가 로컬에서 해석되지만
Linux Docker 빌드에서 module-not-found 로 터진다. 규칙을 하나로 고정한다.

- **PascalCase 는 기능 컴포넌트만**: `SRsDataTable.tsx`, `UserDialog.tsx` 등 화면을 구성하는 컴포넌트 파일.
- **kebab-case 는 그 외 전부**: `components/ui/` 의 shadcn 원시 컴포넌트, 훅, 유틸, 서비스, 타입.
- **훅은 `src/hooks/` 아래에 `use-*.ts`**: 컴포넌트 디렉터리 안에 훅을 두지 않는다.
  **단, shadcn 원시 컴포넌트가 자신의 Context를 소비하기 위해 같은 파일 안에 정의하는 훅
  (예: `components/ui/form.tsx`의 `useFormField`)은 예외로 한다** — 밖으로 분리하면 순환 import가 생긴다.
- **`src/actions/` 아래는 전부 Server Action**: `'use server'` 가 없는 순수 헬퍼는 `src/lib/` 로 보낸다.
  이 규칙 덕분에 RPC 공개 표면 감사가 파일 목록만으로 끝난다.

### 1.2. `components/ui` import 규칙

- **앱 코드는 배럴을 쓴다**: `import { Button, CopyButton } from '@/components/ui'`.
- **`components/ui/` 내부끼리는 서브경로를 쓴다**: 배럴을 경유하면 순환이 생긴다.
- 새 원시 컴포넌트를 추가하면 `src/components/ui/index.ts` 에 **알파벳 순으로** re-export 를 함께 넣는다.
  (빠뜨리면 소비자가 서브경로로 우회하게 되고 규칙이 조용히 무너진다.)

---

## 2. Tailwind CSS 및 스타일링 규칙

- **cn 유틸리티 필수 적용**: 동적인 클래스 네임 조합이나 조건부 스타일링을 적용할 때, 클래스 중복 및 충돌을 방지하기 위해 [tailwind-merge](file:///d:/project/sr/package.json)와 [clsx](file:///d:/project/sr/package.json)가 래핑된 `cn(...)` 함수를 항상 사용하여 스타일을 조합한다.
- **반응형 웹 디자인**: UI는 모바일 디바이스부터 대형 모니터까지 완벽하게 대응하도록 Flexbox, Grid 및 Tailwind의 반응형 접두사(`sm:`, `md:`, `lg:`, `xl:`)를 적절히 활용하여 마크업한다.

---

## 3. 디자인 시스템 명세 (다크 캔버스)

표 중심 업무 앱의 규칙이다. 색은 §0 에 따라 DESIGN.md·`globals.css` 토큰을, 치수는 아래 규칙과 그 구현을 따른다.

### 3.1. 시각적 테마 및 분위기

- 정보의 인지 오류를 줄이기 위한 명확한 타이포그래피 계층 구조 설계.
- **모서리 반경**(실제 체계, 2026-09-18 재측정): 컨트롤(버튼·입력란·SelectTrigger) 8px, 카드 12px(`rounded-card-md`),
  칩·배지 알약(`rounded-full`). 대화상자·탭·알림·모바일 목록 카드는 shadcn 기본 `rounded-lg`(10px)이고, 작은 내부
  요소는 `rounded`(4px)·`rounded-sm`(6px)를 쓴다.
  ⚠️ 목록·상세의 주 컨테이너가 쓰는 `.sr-card-template` 은 반경이 없다(0px, 각진 모서리) — 정리 대상이다.
- 부드럽고 자연스럽게 스며드는 레이어 그림자(Elevation) 처리.
- **간격**: Tailwind 기본 4px 스케일을 쓴다. 조밀한 표·배지는 4px 단위(`gap-1`, `py-0.5` 등)가 필요하므로 8px 배수를
  강제하지 않는다(예전 "8px 배수 엄격" 규정은 코드와 맞지 않아 2026-09-18 결정 D16 으로 폐기).

### 3.2. 색상 — 토큰만 사용한다

색상 값의 정본은 `docs/DESIGN.md`와 `src/app/globals.css`의 CSS 변수다. 본 문서는 값을 복제하지 않는다.

- **hex 리터럴 하드코딩 금지**: 컴포넌트 코드에 `bg-[#…]` / `text-[#…]` / `border-[#…]` 같은
  색상 리터럴을 쓰지 않는다. `bg-background` / `bg-card` / `bg-muted` / `text-foreground` /
  `text-muted-foreground` / `border-border` / `bg-destructive` 등 **토큰 클래스만** 사용한다.
- **왜 금지인가**: 다크 캔버스(`#090909`) 위에 라이트 스펙 색을 하드코딩하면 흰 패널 위 흰 글씨,
  다크 화면 위 흰 상자처럼 **판독 불가 UI**가 만들어진다. 토큰을 쓰면 테마가 바뀌어도 대비가 유지된다.
- **테마 대응**: 색을 지정할 때는 배경과 전경을 **짝으로** 지정한다. 배경만 바꾸고 전경을
  상속에 맡기면 상속된 색이 그 배경과 충돌한다.
- **`cn()` 결과에 문자열을 덧붙이지 않는다**: `cn(...)` 밖에서 템플릿 문자열로 클래스를 이어붙이면
  tailwind-merge의 충돌 해소를 우회하게 되어 두 색 클래스가 동시에 살아남는다.
  분기가 필요하면 처음부터 cva variant로 최종 색을 정의한다.

> ✅ **준수(2026-08-15)**: `components/ui/` 의 hex 리터럴을 전부 토큰으로 교체했다.
> `file-upload.tsx`(흰 패널 위 흰 글씨), `input.tsx`·`textarea.tsx`(다크 화면의 흰 비활성 상자),
> `avatar.tsx`·`button.tsx`(인디고·에메랄드 하드코딩)가 대상이었다.
> `badge.tsx` 는 `bg-destructive text-destructive`(같은 색)를 cva 가 내고 `cn()` **밖에서**
> `bg-destructive/10` 을 덧붙여 겨우 읽히게 만들고 있었다 — variant 가 최종 색을 갖도록 고치고
> 분기를 삭제했다.
>
> 재발 방지로 `eslint.config.mjs` 에 색상 hex 리터럴 금지 규칙(`no-restricted-syntax`)을 걸었다.
> `src/**/*.{ts,tsx}` 에서 `bg-[#…]` / `text-[#…]` 계열을 쓰면 경고가 뜬다.

### 3.3. 타이포그래피 규칙 (Typography Rules)

글자 크기는 Tailwind 기본 스케일(`text-xs`~`text-3xl`)을 쓴다. `docs/DESIGN.md` 의 크기·행간·자간 스케일은
마케팅 사이트 원본의 값이라 참고 자료다(2026-09-18 결정 D16 — 적용된 적이 없다).

> ⚠️ **이 앱에는 웹폰트가 하나도 로드되어 있지 않다**(2026-08-15 실측).
> `src/app/layout.tsx` 에 `next/font` 선언이 없고 `tailwind.config.ts` 에 `fontFamily` 확장도 없다.
> 과거 이 절이 열거하던 `Pretendard Variable` / `Geist` / `Noto Sans KR` / `JetBrains Mono` 는
> **적용된 적이 없다.** 폰트를 실제로 도입하려면 별도 작업으로 하고, 그전까지 이 절에서
> 참조할 것은 스케일뿐이다.

### 3.4. 컴포넌트 스타일링 (Component Stylings)

색상은 §3.2 에 따라 **토큰 클래스만** 쓴다. 아래는 코드가 실제로 따르는 치수 규칙이다.

- **버튼 크기 체계** (`src/components/ui/button.tsx` 의 cva variant 와 1:1):
  - XS: `px-[8px] py-[6px]`, 폰트 `11px` (매우 좁은 레이아웃용)
  - SM: `px-[12px] py-[8px]`, 폰트 `13px` (테이블 행 내부 등 조밀한 영역용)
  - MD: `px-[16px] py-[10px]`, 높이 `40px`, 폰트 `14px` (기본 표준 크기)
  - LG: `px-[24px] py-[14px]`, 폰트 `16px` (강조 액션용)
  - XL: `px-[32px] py-[17px]`, 폰트 `18px` (메인 가입/랜딩 페이지용)
- **버튼 모양**: 모서리 반경 `rounded-[8px]`.
  <sub>`docs/DESIGN.md` 원본은 "모든 CTA 는 흰색 pill" 이라고 규정하지만 그건 분석 대상이던
  마케팅 사이트의 어휘다. 이 앱의 CTA 는 각진 8px 다 — 원본을 그대로 옮기지 않는다.</sub>
- **인터랙티브 상태**: 활성 `hover:opacity-80`. 비활성은 버튼·SelectTrigger 가 `disabled:opacity-50 disabled:pointer-events-none`,
  체크박스·라디오·스위치가 `disabled:opacity-40` 이고, 입력란·텍스트 영역은 불투명도를 낮추지 않는다(`disabled:opacity-100` — 읽기 전용 값이 흐려져 판독 불가가 되지 않게).
  로딩은 `Button` 의 `isLoading` prop 이 맡는다 — 스피너(`Loader2`)를 앞에 붙이고 비활성으로 만든다. 문구 전환은 호출부가 필요할 때만 한다.
- **그림자 고도 (Elevation)**: 값은 `tailwind.config.ts` 의 `boxShadow` 가 `shadow-xs`~`shadow-xl` 을 재정의해 갖고 있다(값을 여기 복제하지 않는다). 실제 배정은 다음과 같다.
  - `shadow-sm`: 입력란·텍스트 영역·SelectTrigger
  - `shadow-md`: 드롭다운·컨텍스트 메뉴·팝오버·Select 목록
  - `shadow-lg`: 다이얼로그·AlertDialog·시트, 하위(sub) 메뉴
  - `shadow-xl`: 현재 쓰는 곳이 없다.
- **카드 모서리**: `<Card>` 의 `rounded-card-md`(12px). `rounded-card-lg`(16px)는 정의만 있고 쓰는 곳이 없다.
- **입력란**: 높이 `40px`(`h-10`), 모서리 반경 `rounded-[8px]`. 텍스트 영역은 최소 높이 `120px`.
  ⚠️ `SelectTrigger` 는 아직 shadcn 기본 높이(`h-9` = 36px)라 입력란과 나란히 두면 4px 낮다(반경은 `rounded-md` =
  8px 로 같다).
  배경은 투명(`bg-transparent` — 놓인 표면을 그대로 보인다)이고 테두리·플레이스홀더 색은 토큰(`border-input` /
  `text-muted-foreground`)을 쓴다.
- **태그/칩**: 완전 둥근 알약(`rounded-full`).
- **상태·우선순위 배지**: 알약형 `Badge` 에 `src/lib/constants/sr.ts` 의 `statusBadgeVariantOf`·`priorityBadgeVariantOf`
  가 준 variant 를 쓴다. 화면에 맵 사본을 두지 않는다 — 사본이 따로 놀아 같은 상태가 화면마다 다른 모양으로 보였다.
  `secondary` variant 는 배경이 카드(`--card`)와 같은 색이라 카드·표 위에서 알약이 보이지 않는다 — 카드 위에 놓이는
  배지에는 `outline` 을 쓴다. 상태별 의미색은 결정 D16 2단계(소유자 시안 확인 후)에서 정한다.
- **아바타**: 20px(XS)~96px(3XL). 이미지가 없으면 `bg-primary/10` 위 이니셜.

<sub>정정(2026-08-15): 이 절은 원래 `bg-[#4F46E5]`·`border-[#e2e8f0]`·`bg-[#f8fafc]` 같은
라이트 스펙 hex 를 직접 규정했다. 그 값들이 다크 캔버스(`#090909`) 위에 그대로 복사되면서
흰 패널 위 흰 글씨·흰 비활성 상자 같은 판독 불가 UI 가 실제로 만들어졌다(§3.2 준수 기록 참조).
색상 규정을 이 절에서 걷어내 §3.2 의 토큰 원칙과 어긋나지 않게 한다.</sub>

### 3.5. 레이아웃 원칙 (Layout Principles)

- 그리드 간격: §3.1 대로 Tailwind 4px 스케일이다. 화면의 섹션 사이는 보통 `space-y-6`(24px)이다.
- 최대 폭(실제 규칙, 2026-09-18 결정 D16): 본문은 기본적으로 폭 제한이 없다(`MainContent` 의 `w-full`) — 표가 넓은
  화면을 쓴다. 대시보드형 화면(대시보드·내 요청)은 `.sr-content-area`(`max-w-7xl`, 1280px), 접수 화면은 `max-w-5xl`
  이다. 예전 "1440px 기준" 규정은 코드에 반영된 적이 없어 폐기했다.

---

## 4. Antigravity 프리미엄 WOW UI 철학

`docs/DESIGN.md` 다크 캔버스 체계 위에 사용자가 처음 웹 어플리케이션에 접속했을 때 시각적인 감동(WOW)을 느낄 수 있도록 아래의 프리미엄 감성 디자인 표준을 조화롭게 융합한다.

> **정정(2026-09-18)**: 이 절은 폐기된 `SaaSify UI Kit` 를 전제로 쓰였고, 아래 세 항목은 같은 문서 §0(인디고 팔레트 폐기)·§3.3(웹폰트 없음)·§3.4(hover 는 `hover:opacity-80`)와 `docs/DESIGN.md`(크로마틱 액센트는 파랑 하나, 그라데이션은 카드 전용)에 모순되며 코드에 반영된 적도 없다 — **폐기**한다. 충돌하면 §0·§3 과 DESIGN.md 가 이긴다.
>
> - ~~부드러운 그라데이션(`from-violet-600 via-indigo-600 to-cyan-500`)~~ — 그라데이션은 DESIGN.md 의 카드 계열에서만 쓴다.
> - ~~호버 리프트·스케일(`hover:-translate-y-0.5`, `hover:scale-[1.02]`)~~ — §3.4 를 따른다.
> - ~~고급 타이포그래피(`Pretendard Variable`·`Geist`·`Noto Sans KR` 결합)~~ — 웹폰트 도입은 §3.3 이 말한 대로 별도 결정이다.

- **Harmony Color Palette**: 브라우저 기본 색상 사용을 금지하며, `docs/DESIGN.md`가 정의한 다크 캔버스 토큰 계층 안에서 색을 고른다(§3.2 — hex 리터럴 금지).
- ~~**글래스모피즘 (Glassmorphism)**: 반투명 배경(`bg-white/10` 또는 `bg-black/30`), `backdrop-blur-md`, `border border-white/20`~~ — **폐기**(2026-09-18 결정 D16). 코드에 이 조합은 0건이고, 어두운 캔버스 위에 쓰면 기존 카드와 다른 밝은 반투명 패널이 생긴다. `.sr-card` 의 반투명·blur 도 `<Card>` 의 utility 에 밀려 그려지지 않는다 — 카드는 불투명 `bg-card` 다. `.sr-card:hover` 에 남아 있던 리프트(translateY·큰 그림자)는 같은 결정으로 걷어냈다.
- **마이크로 애니메이션**: 클릭 가능한 인터랙티브 요소에는 부드러운 전환(`transition-colors` 또는 `transition-all`)을 둔다. hover 표현은 §3.4 를 따른다.

---

## 5. 컴포넌트 재사용 및 검증 규칙

> 2026-08-10: Storybook 을 제거했다. 스토리 파일이 1개뿐이라 사실상 쓰이지 않으면서
> vitest 에 브라우저 모드 프로젝트를 물고 있었다. 컴포넌트 격리 검증은
> **Vitest + @testing-library/react 렌더 테스트**(`__tests__/<원본과 동일한 파일명>.test.tsx`)가
> 담당한다. 원시 컴포넌트는 kebab-case, 기능 컴포넌트는 PascalCase 파일명을 그대로 따른다.
> (`<Name>` 표기가 PascalCase 를 암시해 원시 컴포넌트 테스트가 중복 사본으로 만들어진 적이 있다.)

- **독립적 UI 개발**: 주요 공통 UI 컴포넌트(Button, Select, Modal, Input 등)는 props 조합별
  렌더 테스트를 작성해 컴포넌트 단위로 격리 검증이 가능하도록 설계한다.
- **Props 타입 안전성**: 컴포넌트의 모든 인터페이스는 TypeScript의 `interface` 또는 `type`으로
  정의하며, 각 속성의 양쪽 경로(있음/없음, true/false)가 테스트로 덮여야 한다.
