# 🌌 Constella

> **우주 탐사 테마의 AI 기반 지식 탐구 플랫폼**

키워드를 입력하면 AI가 위키 콘텐츠를 생성하고, 탐사한 지식들이 **별자리 지도(Star Map)**로 시각화됩니다. 다른 탐험가들과 함께 지식의 우주를 항해하세요.

---

## ✨ 주요 기능

### 🔭 AI 지식 탐사
- **통신 콘솔**: Gemini AI에게 질문하면 위키 콘텐츠를 생성합니다
- **별자리 지도**: D3.js 기반 인터랙티브 그래프로 탐사한 토픽들의 관계를 시각화
- **항해 일지**: 발견한 토픽들의 탐사 기록
- **자동 링크**: AI 응답 내 관련 토픽을 `[[키워드]]`로 연결

### 👥 소셜 & 협업
- **공개 프로필**: 다른 탐험가의 항해 기록 열람
- **팔로우 시스템**: 크루원으로 추가하여 활동 추적
- **발견 피드**: 팔로우한 탐험가의 최근 발견 확인
- **직접 통신 (DM)**: SSE 실시간 1:1 메시지
- **공개 통신 (Comms)**: 토픽별 실시간 채팅

### 🚀 협동 탐사
- **원정대 (Expedition)**: 팀 생성, 멤버 초대, 토픽 공유
- **공유 접근 권한**: 원정대 멤버는 공유된 토픽에 접근 가능
- **전용 통신 채널**: 원정대별 Comms 채널

### 🏆 리더보드 & 업적
- **탐험가 랭킹**: 발견 수, 최초 발견, 업적 기준 정렬
- **6종 × 3티어 업적**: 토픽 발견, AI 대화, Comms 활동 등
- **자동 부여**: 토픽 발견/메시지 전송 시 실시간 업적 체크

---

## 🛠️ 기술 스택

| | 기술 |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, D3.js |
| **Backend** | Next.js API Routes, NextAuth v4 (JWT) |
| **Database** | MySQL (Prisma ORM, 이중 클라이언트), Neo4j (지식 그래프) |
| **AI** | Google Gemini 3 Flash Preview |
| **실시간** | Server-Sent Events (SSE) |
| **i18n** | next-intl v4 (한국어/영어) |

---

## 🚀 시작하기

### 필수 요구사항
- Node.js 20+
- MySQL 8.0+
- Neo4j Community Edition 5+
- Google Cloud API Key (Gemini)

### 환경 설정

```bash
# 의존성 설치
npm install

# 환경변수 설정 (.env)
cp .env.example .env
# SSH_USER, SSH_HOST, DATABASE_URL, DATABASE_CONTENT_URL,
# NEO4J_URI, GOOGLE_GENERATIVE_AI_API_KEY,
# NEXTAUTH_SECRET, GOOGLE_CLIENT_ID 등 설정

# DB 초기화
npx prisma db push
npx prisma db push --schema=prisma/content/schema.prisma
npx tsx prisma/seed.ts

# 개발 서버 실행
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 접속하세요.

### 테스트 계정
- **이메일**: `agent@test.local`
- **비밀번호**: `constella-agent`

---

## 📝 스크립트

| 명령어 | 설명 |
|---|---|
| `npm run dev` | SSH 터널 + 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint 검사 |
| `npm test` | 유닛 테스트 |
| `npm run test:uat` | UAT (Playwright) |

---

## 📂 프로젝트 구조

```
src/
├── app/
│   ├── api/          # 17개 API 라우트
│   └── [locale]/     # 14개 페이지 (ko/en)
├── components/       # UI 컴포넌트
├── lib/              # 핵심 모듈 (wiki-engine, achievements, comms-pubsub 등)
└── i18n/             # next-intl 설정

prisma/
├── schema.prisma           # Main DB (사용자/인증)
└── content/schema.prisma   # Content DB (토픽/위키/소셜/업적/원정대)
```

> AI 에이전트 개발 가이드는 [AGENTS.md](./AGENTS.md)를 참조하세요.

---

## 🚢 배포

### 환경변수 (프로덕션)
- `NEXTAUTH_URL`: 공개 URL (`https://your-domain.com`)
- `NEXTAUTH_SECRET`: `openssl rand -base64 32`로 생성
- Google OAuth 리다이렉트 URI: `https://<DOMAIN>/api/auth/callback/google`

### Docker
```bash
docker build -t constella .
docker run -p 3000:3000 --env-file .env constella
```

> Docker에서 호스트 DB 접근 시 `host.docker.internal` 또는 `172.17.0.1` 사용

---

## 📜 라이센스

Private project — All rights reserved.
