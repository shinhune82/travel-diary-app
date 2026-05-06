# 이든이와의 여행 일지 ✈️

## 배포 순서

---

### 1단계 — Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com) 접속
2. **프로젝트 추가** → 이름 입력 (예: `eden-travel`)
3. 좌측 메뉴 **Firestore Database** → **데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)` 선택
   - 보안 규칙: **테스트 모드**로 시작 (나중에 변경 가능)
4. 좌측 상단 ⚙️ **프로젝트 설정** → **내 앱** → `</>` 웹 앱 등록
5. 앱 닉네임 입력 후 **Firebase SDK 구성** 복사

### 2단계 — `src/firebase.js` 수정

복사한 config로 교체:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "eden-travel.firebaseapp.com",
  projectId:         "eden-travel",
  storageBucket:     "eden-travel.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...",
}
```

### 3단계 — GitHub 레포 생성 & 코드 올리기

```bash
# 터미널에서
cd eden-travel-app
git init
git add .
git commit -m "init"

# GitHub에서 새 레포 만들고 (예: eden-travel)
git remote add origin https://github.com/본인아이디/eden-travel.git
git push -u origin main
```

### 4단계 — `vite.config.js` 레포 이름 맞추기

```js
// 레포 이름이 'eden-travel' 이면:
base: '/eden-travel/',
```

수정 후 다시 커밋 & 푸시:
```bash
git add vite.config.js
git commit -m "fix base url"
git push
```

### 5단계 — GitHub Pages 활성화

1. 레포 → **Settings** → **Pages**
2. **Source**: `GitHub Actions` 선택
3. 몇 분 후 자동 배포 완료!

🌐 접속 주소: `https://본인아이디.github.io/eden-travel/`

---

### Firestore 보안 규칙 (나중에 설정)

Firebase 콘솔 → Firestore → **규칙** 탭:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /eden_journal/{document} {
      allow read, write: if true; // 개인 앱이면 이렇게도 OK
    }
  }
}
```

---

### 로컬 개발

```bash
npm install
npm run dev
# http://localhost:5173 에서 확인
```

---

### 앱 아이콘으로 설치하기 (PWA)

배포 후 브라우저에서 접속하면 앱처럼 설치할 수 있어요.

**안드로이드 (크롬)**
1. 브라우저 주소창 오른쪽 `⋮` 메뉴
2. **"홈 화면에 추가"** 또는 **"앱 설치"**
3. 홈 화면에 ✈️ 아이콘 생성 완료!

**iPhone (사파리)**
1. 하단 공유 버튼 (□↑)
2. **"홈 화면에 추가"**
3. 홈 화면에 ✈️ 아이콘 생성 완료!

**PC (크롬/엣지)**
1. 주소창 오른쪽 설치 아이콘 클릭
2. **"설치"**
3. 바탕화면 앱으로 실행 가능!

> 설치 후엔 주소 입력 없이 아이콘만 클릭하면 바로 열려요.
