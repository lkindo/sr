# 🔍 브라우저 콘솔 로그 확인 가이드

**에러 발생 확인**: ✅  
**스택 트레이스 확인**: ✅  
**정확한 에러 메시지 확인**: ⏳ 진행 중

---

## 📋 확인해주실 사항

### 1. 브라우저 콘솔 전체 로그

브라우저 콘솔(F12)에서 **스크롤을 맨 위로** 올려주세요!

스택 트레이스 **위에** 다음과 같은 로그가 있어야 합니다:

```javascript
🔍 [Client] fetchSRs 시작
🔍 [Client] fetch /api/srs 호출 중...
🔍 [Client] 응답 받음: {status: 500, statusText: "Internal Server Error", ok: false}
❌ [Client] API 에러 응답: {error: "...", details: "..."}
❌ [Client] fetchSRs 에러: Error: ...
Error
    at captureStackTrace ...  ← 이게 지금 보신 부분
```

---

### 2. 특히 중요한 로그

#### ❌ [Client] API 에러 응답:

이 로그를 찾아주세요! 여기에 정확한 에러 원인이 있습니다:

```javascript
❌ [Client] API 에러 응답: {
  error: "SR 목록을 불러오는 중 오류가 발생했습니다.",
  details: "여기가 정확한 에러 메시지입니다!" ← 이 부분!
}
```

---

### 3. Toast 알림 메시지

화면 우측 상단에 빨간색 알림이 떴을 것입니다:

```
오류
SR 목록을 불러오는데 실패했습니다: [에러 메시지]
```

**이 `[에러 메시지]` 부분도 중요합니다!**

---

## 🔧 로그가 안 보이는 경우

### 상황 1: 🔍 로그가 하나도 없는 경우

**원인**: 브라우저가 캐시된 파일을 사용 중

**해결**:
```
1. Ctrl + Shift + R (강력 새로고침)
2. F12 → Network 탭 → "Disable cache" 체크
3. 페이지 새로고침
4. SR 관리 다시 클릭
```

---

### 상황 2: 오래된 로그만 보이는 경우

**원인**: 서버가 재시작되지 않음

**해결**:
```powershell
# PowerShell에서 실행
taskkill /F /IM node.exe
pnpm dev
```

그 후:
```
1. 브라우저에서 Ctrl + Shift + R
2. 로그인
3. SR 관리 클릭
4. 콘솔 확인
```

---

### 상황 3: fetch 자체가 실패하는 경우

**로그 예시**:
```javascript
🔍 [Client] fetch /api/srs 호출 중...
❌ TypeError: Failed to fetch
```

**원인**: 서버가 실행 중이지 않음

**확인**:
```
http://localhost:3000 접속 가능한가요?
```

---

## 📸 공유해주실 정보

### 방법 1: 콘솔 로그 복사

```
1. 브라우저 콘솔에서 마우스 우클릭
2. "Save as..." 클릭
3. 파일 저장
```

### 방법 2: 텍스트로 복사

```
1. 콘솔의 모든 로그 선택 (Ctrl + A)
2. 복사 (Ctrl + C)
3. 붙여넣기
```

### 방법 3: 스크린샷

```
1. 콘솔 전체가 보이도록 스크롤
2. Win + Shift + S (캡처 도구)
3. 전체 캡처
```

---

## 🎯 우리가 찾고 있는 정보

### 최우선 정보:

```javascript
❌ [Client] API 에러 응답: {
  error: "...",
  details: "[이 부분]"  ← 가장 중요!
}
```

### 추가 정보:

1. **응답 상태 코드**
   ```javascript
   🔍 [Client] 응답 받음: {status: ???, ...}
   ```

2. **Toast 메시지**
   ```
   화면 알림: "SR 목록을 불러오는데 실패했습니다: [메시지]"
   ```

3. **Network 탭** (선택적)
   ```
   F12 → Network → "srs" 요청 → Response 탭
   ```

---

## 💡 빠른 체크리스트

테스트 전에 확인:

- [ ] 서버 실행 중? (`http://localhost:3000` 접속 가능?)
- [ ] 브라우저 캐시 비활성화? (F12 → Network → Disable cache)
- [ ] 콘솔 초기화? (Console → Clear console)
- [ ] 로그인 완료?
- [ ] SR 관리 클릭?

---

## 🚀 다시 테스트

### Step 1: 환경 초기화
```
1. Ctrl + Shift + R (강력 새로고침)
2. F12 → Console → Clear console
3. F12 → Network → Disable cache 체크
```

### Step 2: 테스트 실행
```
1. http://localhost:3000 접속
2. 로그인 (admin@example.com / admin123)
3. SR 관리 클릭
4. 콘솔 확인!
```

### Step 3: 로그 수집
```
- 콘솔 맨 위부터 맨 아래까지 모든 로그
- 특히 🔍와 ❌로 시작하는 로그
- Toast 알림 메시지
```

---

## 📞 로그 공유 형식

다음 형식으로 공유해주시면 가장 좋습니다:

```
=== 브라우저 콘솔 로그 ===

🔍 [Client] fetchSRs 시작
🔍 [Client] fetch /api/srs 호출 중...
🔍 [Client] 응답 받음: {status: 500, statusText: "Internal Server Error", ok: false}
❌ [Client] API 에러 응답: {
  error: "SR 목록을 불러오는 중 오류가 발생했습니다.",
  details: "[여기가 핵심 에러 메시지입니다!]"
}
❌ [Client] fetchSRs 에러: Error: [에러 메시지]
Error
    at captureStackTrace ...

=== Toast 알림 ===
SR 목록을 불러오는데 실패했습니다: [에러 메시지]

=== Network 탭 (선택적) ===
Request URL: http://localhost:3000/api/srs
Status Code: 500
Response: {...}
```

---

**이 정보만 있으면 정확히 문제를 파악하고 해결할 수 있습니다!** 🎯

