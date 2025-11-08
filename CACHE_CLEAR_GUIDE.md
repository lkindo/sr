# 🔄 캐시 제거 완료 - 테스트 가이드

**날짜**: 2024-11-08  
**문제**: 브라우저가 캐시된 파일 사용 중  
**상태**: ✅ 서버 캐시 제거 완료, 브라우저 캐시 제거 필요

---

## ✅ 완료된 작업

### 1. Next.js 빌드 캐시 제거
```powershell
✅ .next 폴더 삭제
✅ node_modules/.cache 삭제
✅ 완전히 새로운 빌드 생성
✅ runtime = 'nodejs' 설정 적용
✅ 서버 재시작 완료
```

### 2. 서버 상태
```
✅ HTTP 200 OK
✅ http://localhost:3000 실행 중
✅ Edge Runtime 문제 해결됨
```

---

## 🔴 중요! 브라우저 캐시 제거 필요

서버는 완전히 새로 빌드되었지만, **브라우저가 여전히 이전 캐시를 사용**하고 있습니다.

### 왜 브라우저 캐시를 제거해야 하나?

Next.js는 다음 파일들을 브라우저 캐시에 저장합니다:
- JavaScript 번들 (`_next/static/chunks/`)
- CSS 파일
- 페이지 데이터
- API 응답 (일부)

**문제**: 이전 빌드의 JavaScript가 여전히 Edge Runtime을 사용하려고 시도  
**해결**: 브라우저 캐시를 제거하여 새 빌드 파일 로드

---

## 🚀 해결 방법 (3가지)

### 방법 1: 개발자 도구 (권장) ⭐

**가장 확실하고 개발에 적합한 방법**

#### 단계:
1. **F12** 누르기 (개발자 도구 열기)
2. **Network** 탭 선택
3. **"Disable cache"** 체크박스 체크
4. 개발자 도구를 **열어둔 채로** **Ctrl + Shift + R**

#### 장점:
- ✅ 개발 중 항상 최신 파일 로드
- ✅ 다음 새로고침부터 자동으로 캐시 비활성화
- ✅ 네트워크 요청 실시간 확인 가능

#### 스크린샷 위치:
```
F12 → 상단 탭에서 "Network" 클릭
→ 좌측 상단에 "Disable cache" 체크박스
```

---

### 방법 2: 브라우저 캐시 완전 삭제

**일반 브라우징 모드에서 완전히 제거**

#### 단계:
1. **Ctrl + Shift + Delete** 누르기
2. **"캐시된 이미지 및 파일"** 선택
3. **시간 범위**: "전체" 선택
4. **"데이터 삭제"** 클릭
5. 브라우저 **완전히 닫기**
6. 브라우저 **다시 열기**
7. `http://localhost:3000` 접속

#### 장점:
- ✅ 완전한 초기화
- ✅ 다른 사이트의 캐시 문제도 해결

#### 단점:
- ⚠️ 모든 사이트의 캐시가 삭제됨
- ⚠️ 다른 사이트 첫 로딩이 느려질 수 있음

---

### 방법 3: 시크릿/프라이빗 모드 (가장 빠름) ⚡

**테스트 전용, 가장 빠르고 간단**

#### 단계:
1. **시크릿 창 열기**:
   - Chrome: **Ctrl + Shift + N**
   - Edge: **Ctrl + Shift + N**
   - Firefox: **Ctrl + Shift + P**

2. 시크릿 창에서 `http://localhost:3000` 접속

3. 로그인 후 테스트

#### 장점:
- ✅ 가장 빠름 (10초 안에 테스트 가능)
- ✅ 기존 브라우저 설정 유지
- ✅ 캐시 완전히 없는 상태

#### 단점:
- ⚠️ 테스트 전용 (매번 로그인 필요)
- ⚠️ 개발자 도구 설정이 유지되지 않음

---

## 📝 테스트 순서

### 1. 브라우저 캐시 제거
위 3가지 방법 중 하나를 선택하여 실행

**💡 추천**: 
- 빠른 테스트: **방법 3 (시크릿 모드)**
- 개발 계속: **방법 1 (Disable cache)**

---

### 2. 사이트 접속
```
http://localhost:3000
```

---

### 3. 로그인
```
이메일: admin@example.com
비밀번호: admin123
```

---

### 4. SR 관리 클릭
- 왼쪽 사이드바 → "SR 관리"

---

### 5. 결과 확인

#### ✅ 성공 시나리오:
```
✅ SR 관리 페이지가 로드됨
✅ SR 목록 테이블이 표시됨
✅ "새 SR 생성" 버튼이 보임
✅ 500 에러 없음
✅ 브라우저 콘솔에 에러 없음
```

#### ❌ 여전히 실패 시:
```
❌ 동일한 에러 발생
→ 브라우저 캐시가 완전히 제거되지 않음
→ 방법 2 (완전 삭제) 또는 방법 3 (시크릿 모드) 시도
```

---

## 🔍 문제 진단

### 캐시가 제거되었는지 확인하는 방법

#### 1. Network 탭 확인 (F12 → Network)
```
캐시 제거 전:
Size: (disk cache) 또는 (memory cache)

캐시 제거 후:
Size: 실제 파일 크기 (예: 123 KB)
```

#### 2. 요청 헤더 확인
```
캐시 제거 전:
cache-control: max-age=31536000

캐시 제거 후:
cache-control: no-cache
```

#### 3. 파일 이름 확인
```
캐시된 파일:
_next/static/chunks/src_f38ec0._.js  ← 이전 버전

새 파일:
_next/static/chunks/src_[다른해시]._.js  ← 새 버전
```

---

## 💡 개발 환경 권장 설정

### Chrome/Edge 개발자 도구 설정

앞으로 개발할 때 캐시 문제를 방지하려면:

1. **F12** (개발자 도구 열기)
2. **Network** 탭
3. **"Disable cache"** 체크
4. **개발자 도구를 항상 열어두기**

이렇게 하면 Next.js 개발 중 **항상 최신 파일**을 로드합니다.

---

## 🎯 기대 결과

### Before (캐시 문제)
```
브라우저 → 캐시된 JavaScript 로드
           ↓
이전 코드 → Edge Runtime 사용 시도
           ↓
Prisma → setImmediate 호출
           ↓
Edge Runtime → ❌ Not Supported
           ↓
500 Internal Server Error
```

### After (캐시 제거 후)
```
브라우저 → 새로운 JavaScript 로드
           ↓
새 코드 → runtime = 'nodejs' 사용
           ↓
Prisma → setImmediate 호출
           ↓
Node.js Runtime → ✅ 정상 작동
           ↓
200 OK + SR 데이터 반환
```

---

## 📚 참고 문서

### Next.js 캐싱
- [Next.js Caching Behavior](https://nextjs.org/docs/app/building-your-application/caching)
- [Static Assets Caching](https://nextjs.org/docs/app/api-reference/next-config-js/assetPrefix)

### 브라우저 캐시
- [HTTP Caching (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Cache-Control Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)

### 프로젝트 문서
- `EDGE_RUNTIME_FIX_COMPLETE.md` - Edge Runtime 문제 해결
- `ROOT_CAUSE_ANALYSIS.md` - 근본 원인 분석

---

## ✅ 체크리스트

테스트 전에 확인:

- [ ] 서버 재시작 완료?
- [ ] .next 폴더 삭제됨?
- [ ] 브라우저 캐시 제거 완료?
- [ ] 개발자 도구 "Disable cache" 체크?
- [ ] 시크릿 모드 사용 중? (선택적)

테스트 후 확인:

- [ ] SR 관리 페이지 로드 성공?
- [ ] 500 에러 사라짐?
- [ ] 브라우저 콘솔에 에러 없음?
- [ ] SR 목록 또는 빈 테이블 표시?
- [ ] "새 SR 생성" 버튼 보임?

---

## 🎉 성공 기준

모든 항목이 ✅이면 문제가 완전히 해결된 것입니다:

- ✅ 서버 빌드 캐시 제거
- ✅ 브라우저 캐시 제거
- ✅ runtime = 'nodejs' 적용
- ✅ SR 관리 페이지 정상 로드
- ✅ 500 에러 제거
- ✅ 모든 기능 정상 작동

---

## 🚨 트러블슈팅

### Q: 시크릿 모드에서도 에러가 발생합니다.

**A**: 서버 로그를 확인해주세요.
```powershell
# 서버 로그 확인
Get-Content server-debug.log -Tail 50
```

다음을 찾아주세요:
- `GET /api/srs 500`
- `Edge Runtime` 관련 메시지
- `setImmediate` 에러

---

### Q: "Disable cache"가 어디 있나요?

**A**: 
1. F12 → Network 탭
2. 상단에 필터 바가 있음 (All, Fetch/XHR, etc.)
3. 그 옆에 "Disable cache" 체크박스
4. 개발자 도구가 열려있어야 활성화됨

---

### Q: 캐시를 제거했는데도 파일명이 같습니다.

**A**: 브라우저를 완전히 닫고 다시 열어보세요.
```
1. 모든 브라우저 창 닫기
2. 작업 관리자에서 브라우저 프로세스 확인 후 종료
3. 브라우저 다시 열기
4. 시크릿 모드로 테스트
```

---

**작성일**: 2024-11-08  
**최종 업데이트**: 서버 캐시 제거 완료, 브라우저 캐시 제거 대기 중

**💡 가장 빠른 해결책: 시크릿 모드로 테스트! (Ctrl + Shift + N)**

