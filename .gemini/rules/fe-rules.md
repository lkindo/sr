# 🎨 기술 규칙: 프론트엔드 (fe-rules.md)

본 문서는 프론트엔드 레이어(Next.js App Router, Tailwind CSS)와 관련된 기술 헌법 및 UI 스타일 가이드이다.

> **디자인 정본 선언(2026-08-15)**: 색상·타이포그래피·radius·spacing 토큰의 단일 정본은
> **`docs/DESIGN.md`(다크 캔버스 체계)** 이며, 구현 진입점은 `src/app/globals.css`의 CSS 변수와
> `tailwind.config.ts`다. 본 문서는 색상 값을 복제하지 않는다.
> 과거 이 문서가 규정하던 `SaaSify-UI-Kit` 라이트 인디고 팔레트는 **폐기한다** — 실측 결과
> 코드에 인디고 계열 사용은 0건이고 캔버스는 `#090909`다. 정본이 둘이던 동안 개발자가
> 라이트 스펙을 그대로 옮겨 적으면서 다크 화면 위 흰 글씨·흰 상자 같은 **판독 불가 UI**가
> 실제로 만들어졌다.

---

## 1. Next.js App Router 아키텍처 규칙

- **서버 컴포넌트 우선 (Server Components First)**: 데이터 페칭 및 민감한 로직을 수행하는 모든 컴포넌트는 기본적으로 React Server Component(RSC)로 설계한다.
- **클라이언트 컴포넌트 최소화**: 사용자 인터랙션(이벤트 핸들러, `useState`, `useEffect` 등)이 꼭 필요한 단말 리프(Leaf) 컴포넌트에 한해서만 파일 최상단에 `"use client"`를 선언하여 Client Component로 설계한다.
- **경계 분리**: 데이터 조회 로직이 담긴 서버 컴포넌트 내부에 클라이언트 컴포넌트를 자식(Children)이나 Props 형태로 주입하여 성능과 데이터 로딩을 효율화한다.

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

## 3. SaaSify UI Kit 디자인 시스템 명세

SaaSify UI 킷은 현대적이고 전문적인 IT/SaaS 제품을 구축하기 위한 완성도 높은 디자인 시스템이며 신뢰감 있고 직관적(Clean and Trustworthy)인 인터페이스를 보장한다.

### 3.1. 시각적 테마 및 분위기

- 정보의 인지 오류를 줄이기 위한 명확한 타이포그래피 계층 구조 설계.
- 컴포넌트 전반에 모서리 반경 8px를 기본값으로 사용하는 현대적인 미학 적용.
- 부드럽고 자연스럽게 스며드는 레이어 그림자(Elevation) 처리.
- 시각적 일관성을 유지하는 간격 규칙(8px 배수) 적용.

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

- `Pretendard Variable`, `Geist`, `Noto Sans KR` 폰트를 혼용하여 가독성과 서체 디자인의 완성도를 확보한다.
- 소스코드 영역에는 고정폭 서체인 `JetBrains Mono`를 적용한다.
- **텍스트 스케일 계층 구조**:
  - **대형 디스플레이 제목 (Display)**: `48px / Bold`, 줄높이 1.1 (서비스 메인 대문용).
  - **헤드라인 레벨 1 (H1)**: `36px / Bold`, 줄높이 1.2 (페이지 주요 섹션 제목용).
  - **서브 헤드라인 레벨 2 (H2)**: `28px / SemiBold`, 줄높이 1.3 (서브 섹션 카드 타이틀용).
  - **본문 크게 (Body Large)**: `16px / Regular`, 줄높이 1.5 (상세 설명 및 본문용).
  - **코드 (Code)**: `13px / Mono`, 줄높이 1.6 (개발 소스코드 영역 전용).

### 3.4. 컴포넌트 스타일링 (Component Stylings)

- **버튼 (Buttons)**:
  - 모양: 모서리 반경 8px (`rounded-[8px]`)을 기본으로 유지.
  - 크기 체계:
    - XS: `px-[8px] py-[6px]`, 폰트 `11px` (매우 좁은 레이아웃용)
    - SM: `px-[12px] py-[8px]`, 폰트 `13px` (테이블 행 내부 등 조밀한 영역용)
    - MD: `px-[16px] py-[10px]`, 높이 `40px`, 폰트 `14px` (기본 표준 크기)
    - LG: `px-[24px] py-[14px]`, 폰트 `16px` (강조 액션용)
    - XL: `px-[32px] py-[17px]`, 폰트 `18px` (메인 가입/랜딩 페이지용)
  - 변형 스타일:
    - 기본형(Primary): 인디고 배경 (`bg-[#4F46E5]` 또는 `bg-[#6366F1]`) + 흰색 텍스트.
    - 보조형(Secondary): 투명 배경 + 인디고 테두리 (`border-[#4F46E5]`) + 인디고 텍스트.
    - 고스트(Ghost): 투명 배경 + 테두리 없음 + 인디고 텍스트.
    - 위험(Danger): 빨간색 배경 (`bg-[#EF4444]`) + 흰색 텍스트.
    - 성공(Success): 초록색 배경 (`bg-[#10B981]`) + 흰색 텍스트.
  - 인터랙티브 상태: 활성 `hover:opacity-80`, 비활성 `opacity-40 select-none pointer-events-none`, 로딩 시 텍스트 전환 및 로딩 비활성 유지.
- **카드 및 컨테이너 (Cards & Containers)**:
  - 모서리 반경: 기본 `12px (rounded-[12px])` 혹은 넓은 영역은 `16px (rounded-[16px])` 사용.
  - 배경색 및 선: 기본 흰색 (`bg-white`) 배경에 얇은 테두리 (`border-[#e2e8f0]`) 적용.
  - 그림자 고도 (Elevation Shadows):
    - XS: `shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]` (플랫한 칩 및 소형 카드)
    - SM: `shadow-[0px_4px_6px_0px_rgba(0,0,0,0.05)]`
    - MD: `shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),_0px_4px_6px_0px_rgba(0,0,0,0.05)]` (일반 카드/다이얼로그)
    - LG: `shadow-[0px_20px_25px_0px_rgba(0,0,0,0.05)]`
    - XL: `shadow-[0px_25px_50px_0px_rgba(0,0,0,0.1)]` (드롭다운 메뉴 및 오버레이 팝업)
- **입력란 및 폼 (Inputs & Forms)**:
  - 텍스트 입력창 (Text Inputs): 높이 `40px`, 모서리 반경 `8px` (`rounded-[8px]`).
    - 기본: `border-[#e2e8f0]`, 플레이스홀더 `placeholder-[#94a3b8]`.
    - 포커스: 두꺼운 인디고 보더 `focus:border-2 focus:border-[#6366f1]`.
    - 오류: 빨간색 보더 `border-[#ef4444]`, 하단에 12px 에러 텍스트 표시.
    - 비활성: 배경 `bg-[#f8fafc]`, 텍스트/플레이스홀더 `text-[#94a3b8]`.
  - 텍스트 영역 (Textarea): 높이 `120px`, 모서리 반경 `8px`, 우측 하단에 글자 수 표기기(`0/500`) 배치.
  - 선택 컨트롤 (Selection Controls):
    - 체크박스: 선택 시 인디고 배경 사각형 (`rounded-[4px] size-[18px]`), 미선택 시 슬레이트 200 테두리.
    - 라디오 버튼: 선택 시 두꺼운 테두리의 인디고 동그라미 (`circle r="7" stroke="#4F46E5" strokeWidth="4"`), 미선택 시 슬레이트 200 원형 테두리.
    - 토글스위치: 선택 시 인디고 배경에 우측 원 배치 (`cx="29"`), 미선택 시 슬레이트 200 배경에 좌측 원 배치 (`cx="11"`).
  - 파일 업로드 드롭존 (File Upload Zone): 옅은 슬레이트 배경 (`bg-[#f8fafc]`) + 인디고 200 점선 테두리 (`border-dashed border-[#c7d2fe]`), 업로드용 구름 모양 아이콘 포함.
- **배지, 태그 및 아바타 (Badges, Tags & Avatars)**:
  - 숫자 배지: 소형(24px), 중형(32px), 대형(48px - 아바타 우측 상단에 걸침). 알림 수 표시에 빨간색 (`bg-[#ef4444]`) 혹은 인디고 배경 사용.
  - 상태 점: 10px 크기 동그라미. 온라인(성공 초록), 자리 비움(경고 주황), 바쁨(오류 빨강).
  - 태그/칩 (Tags/Chips): 완전 둥근 알약 모양 (`rounded-[9999px]`). 인디고/그린/옐로우/레드 계열의 배경과 텍스트 조합. 닫기 버튼은 우측에 `x-circle` 아이콘 배치.
  - 아바타 (Avatars): 20px(XS)부터 96px(3XL) 크기 제공. 원형 이미지 또는 인디고 100 배경 위의 영문 이니셜 텍스트로 구성.

### 3.5. 레이아웃 원칙 (Layout Principles)

- 그리드 간격: 모든 간격은 8px의 배수(`8px`, `16px`, `24px`, `32px`, `48px`, `64px`)를 엄격하게 적용하여 시각적 질서를 보장한다.
- 배치 전략: 컴포넌트 간 여백은 보통 `24px` 혹은 `48px`을 적용하여 여백을 확보한다.
- 최대 폭: 가로폭 `1440px` 단위의 데스크톱 해상도를 기준으로 레이아웃 정렬.

---

## 4. Antigravity 프리미엄 WOW UI 철학

SaaSify UI Kit의 견고한 구조 위에 사용자가 처음 웹 어플리케이션에 접속했을 때 시각적인 감동(WOW)을 느낄 수 있도록 아래의 프리미엄 감성 디자인 표준을 조화롭게 융합한다.

- **Harmony Color Palette**: 브라우저 기본 색상 사용을 금지하며, `docs/DESIGN.md`가 정의한 다크 캔버스 토큰 계층 안에서 색을 고른다(§3.2 — hex 리터럴 금지).
- **글래스모피즘 (Glassmorphism)**: 대시보드 카드, 모달, 네비게이션 바 등 주요 컨테이너 레이아웃에는 반투명 배경(`bg-white/10` 또는 `bg-black/30`), 백드롭 블러(`backdrop-blur-md`), 미세한 외곽선 테두리(`border border-white/20`)를 조합하여 깊이감을 극대화한다.
- **부드러운 그라데이션**: 텍스트 타이틀이나 핵심 버튼, 하이라이트 영역에는 세련된 메탈릭 그라데이션 또는 은은한 파스텔톤 그라데이션(`bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500`)을 적용하여 고급스러운 품질을 유지한다.
- **마이크로 애니메이션 & Hover 효과**:
  - 클릭 가능한 모든 인터랙티브 요소에는 `transition-all duration-300 ease-in-out`을 기본 적용한다.
  - 마우스 호버 시 미세한 리프트 업(`hover:-translate-y-0.5`), 스케일 조정(`hover:scale-[1.02]`), 그림자 깊이 변화(`hover:shadow-lg`) 및 글로우 효과(Glow effect)를 주어 화면이 살아 움직이는 듯한 입체감을 준다.
- **고급 타이포그래피**: `Pretendard Variable`, `Geist`, `Noto Sans KR` 폰트를 적극 결합하여 기하학적 형태와 미학적 세련됨을 극대화한다.

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
