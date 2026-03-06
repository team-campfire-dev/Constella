# Constella — AI 개발자 가이드

> 이 문서는 AI 에이전트가 Constella 프로젝트를 유지보수·개발할 때 반드시 숙지해야 할 핵심 사항을 정리한 것입니다.

---

## 1. 프로젝트 정체성

Constella는 **우주 탐사 테마의 AI 기반 지식 탐구 플랫폼**입니다.
- 사용자가 키워드를 입력하면 **Gemini AI**가 위키 콘텐츠를 생성합니다.
- 생성된 지식은 **MySQL(콘텐츠 DB)**에 저장되고, **Neo4j(지식 그래프)**에 동기화됩니다.
- 사용자는 **별자리 지도(Star Map)**에서 자신이 탐사한 토픽들의 관계를 시각적으로 탐색합니다.
- 소셜 기능(팔로우, 공개 프로필, 피드, DM, 원정대)으로 다른 탐험가와 협업합니다.
- **업적 시스템**으로 탐사 활동을 추적하고, **리더보드**에서 경쟁합니다.

**핵심 메타포**: 지식 = 별, 탐사 = 우주 항해, 채팅 = 통신 콘솔, 다른 유저 = 탐험가

---

## 2. 기술 스택 요약

| 계층 | 기술 |
|---|---|
| 프레임워크 | **Next.js 16** (App Router, React 19, React Compiler 활성화) |
| 스타일링 | **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme inline` 문법) |
| 인증 | **NextAuth v4** (JWT 전략, Google OAuth + Credentials) |
| DB 메인 | **MySQL** via Prisma (`prisma/schema.prisma`) — 사용자/계정/세션 |
| DB 콘텐츠 | **MySQL** via 별도 Prisma Client (`prisma/content/schema.prisma`) — 토픽/위키/채팅/소셜/업적/원정대 |
| 그래프 DB | **Neo4j** (Bolt 프로토콜, Community Edition) |
| AI | **Google Gemini 3 Flash Preview** (`@google/generative-ai`) |
| i18n | **next-intl v4** (한국어 `ko` 기본, 영어 `en` 지원) |
| 실시간 통신 | **Server-Sent Events (SSE)** + EventEmitter 기반 Pub/Sub |
| 로깅 | **Winston** (개발: colorize+simple, 프로덕션: JSON) |

---

## 3. 프로젝트 구조 (핵심 경로)

```
src/
├── app/
│   ├── api/                        # 17개 API 라우트
│   │   ├── auth/[...nextauth]/     # NextAuth 핸들러
│   │   ├── chat/                   # AI 채팅 (POST: wiki-engine, GET: 이력)
│   │   ├── comms/                  # 공개 통신 (POST/GET)
│   │   │   └── stream/            # SSE 실시간 스트림
│   │   ├── dm/                    # 1:1 직접 통신 (GET/POST)
│   │   ├── expedition/            # 원정대 CRUD (GET/POST)
│   │   │   └── [id]/             # 상세/수정/삭제
│   │   │       ├── members/      # 멤버 관리
│   │   │       └── logs/         # 공유 토픽
│   │   ├── explorer/[id]/         # 공개 프로필 API
│   │   ├── feed/                  # 발견 피드 (팔로잉 필터)
│   │   ├── follow/                # 팔로우/언팔로우
│   │   ├── graph/                 # 그래프 데이터 (GET, 번역 포함)
│   │   ├── achievements/          # 업적 조회 + 자동 부여
│   │   ├── leaderboard/           # 탐험가 랭킹
│   │   ├── ship-log/              # 탐사 기록 (GET)
│   │   ├── topic/                 # 토픽 상세 (GET, 접근 제어)
│   │   └── wiki/                  # 수동 위키 편집 (POST)
│   ├── [locale]/                  # i18n 동적 세그먼트 (14개 페이지)
│   │   ├── layout.tsx             # RootLayout (서버)
│   │   ├── page.tsx               # 홈 (Star Map 대시보드)
│   │   ├── console/               # AI Chat + Comms (클라이언트)
│   │   ├── star-map/              # 별자리 지도 전용 페이지
│   │   ├── ship-log/              # 탐사 기록
│   │   ├── feed/                  # 발견 피드
│   │   ├── dm/                    # 직접 통신 (1:1 메시지)
│   │   ├── expeditions/           # 원정대 목록
│   │   │   └── [id]/             # 원정대 상세
│   │   ├── explorer/[id]/         # 공개 탐험가 프로필
│   │   ├── leaderboard/           # 리더보드 + 업적 카탈로그
│   │   ├── login/                 # 로그인
│   │   └── profile/               # 프로필 보기/수정
│   └── globals.css
├── components/                    # UI 컴포넌트
│   ├── DashboardLayout.tsx        # 사이드바 + 메인 레이아웃
│   ├── StarGraph.tsx              # D3 기반 별자리 그래프
│   ├── UserAvatar.tsx             # 프로필 이미지 (object-cover 보장)
│   └── ...
├── lib/                           # 핵심 모듈
│   ├── achievements.ts            # 업적 정의 + 자동 부여 엔진
│   ├── comms-pubsub.ts            # EventEmitter 기반 SSE Pub/Sub
│   ├── wiki-engine.ts             # AI 지식 생성 파이프라인
│   ├── gemini.ts                  # Gemini API 래퍼
│   ├── graph.ts                   # Neo4j Cypher 동기화
│   ├── transaction.ts             # 이중 트랜잭션 관리
│   ├── neo4j.ts                   # Neo4j 드라이버 싱글톤
│   ├── prisma.ts                  # Main DB 싱글톤
│   ├── prisma-content.ts          # Content DB 싱글톤
│   ├── auth.ts                    # NextAuth 설정
│   ├── rate-limit.ts              # 인메모리 rate limiter
│   ├── logger.ts                  # Winston 로거
│   └── *.test.ts                  # Vitest 단위 테스트
├── test/
│   └── setup.ts                   # Vitest 전역 mock 설정 (Prisma, Neo4j, Logger)
├── i18n/
│   ├── navigation.ts              # 라우팅 (locales: ['en', 'ko'])
│   └── request.ts                 # 서버 locale 설정
└── types/next-auth.d.ts           # Session/User 타입 확장

prisma/
├── schema.prisma                  # Main DB 스키마
├── seed.ts                        # Dev agent 시딩
└── content/schema.prisma          # Content DB 스키마

messages/
├── ko.json                        # 한국어 번역
└── en.json                        # 영어 번역
```

---

## 4. 핵심 모듈 의존 관계 (`src/lib/`)

```
chat API  ──→  wiki-engine.ts  ──→  gemini.ts        (AI 콘텐츠 생성)
                    │
                    ├──→  transaction.ts  ──→  neo4j.ts          (Neo4j 드라이버)
                    │        │
                    │        └──→  prisma-content.ts  (Content DB)
                    │
                    └──→  graph.ts          (Cypher MERGE 쿼리)

graph API ──→  neo4j.ts + prisma-content.ts + gemini.ts (batchTranslate)
topic API ──→  prisma-content.ts + wiki-engine.ts
comms API ──→  prisma-content.ts + prisma.ts + comms-pubsub.ts (SSE)
dm API    ──→  prisma-content.ts + prisma.ts + comms-pubsub.ts (SSE)
auth      ──→  prisma.ts (Main DB)

chat/comms POST ──→  achievements.ts (fire-and-forget 업적 체크)
```

### 모듈별 핵심 역할

| 모듈 | 역할 | 절대 건드리면 안 되는 것 |
|---|---|---|
| `wiki-engine.ts` | 전체 지식 생성 파이프라인 (핵심) | `KeywordCache` SWR 로직, 자동 링크 순서 |
| `gemini.ts` | Gemini API 호출 + JSON 파싱 | 프롬프트 구조 (필드명 변경 시 전체 파이프라인 깨짐) |
| `graph.ts` | Cypher MERGE 쿼리 | `MERGE` 키 (`name` 필드) — Neo4j 중복 방지 핵심 |
| `transaction.ts` | 이중 트랜잭션 관리 | Neo4j 우선 커밋 → Prisma 순서 |
| `neo4j.ts` | Neo4j 드라이버 싱글톤 + `getGraphData` | 글로벌 캐싱 패턴 |
| `prisma.ts` | Main DB 클라이언트 싱글톤 | Hot-reload 보호용 global 패턴 |
| `prisma-content.ts` | Content DB 클라이언트 싱글톤 | `@prisma/client-content` import 경로 |
| `auth.ts` | NextAuth 설정 | `safeCompare()` 타이밍 공격 방어 |
| `comms-pubsub.ts` | SSE 실시간 메시지 Pub/Sub | EventEmitter 기반, `comms:${channel}` 키 |
| `achievements.ts` | 업적 정의 + 자동 부여 | 6종×3티어 임계값 |
| `rate-limit.ts` | 인메모리 rate limiter | 엔드포인트별 키 문자열 |
| `logger.ts` | Winston 로거 | — |

---

## 5. 데이터베이스 — 반드시 알아야 할 사항

### 5.1 이중 Prisma 클라이언트

이 프로젝트는 **두 개의 분리된 MySQL 데이터베이스**를 사용합니다:

| 구분 | 클라이언트 | import 경로 | 환경변수 |
|---|---|---|---|
| Main DB | `prisma` | `@prisma/client` | `DATABASE_URL` |
| Content DB | `prismaContent` | `@prisma/client-content` | `DATABASE_CONTENT_URL` |

> **⚠️ 주의**: `prisma generate` 후 반드시 `prisma generate --schema=prisma/content/schema.prisma`도 실행해야 합니다. `postinstall` 스크립트에 자동화되어 있으나, 스키마 변경 후 dev 서버 재시작 필요.

### 5.2 Content DB 모델 관계도

```
Topic (name: unique, lowercase)
  ├── Alias[] (별칭, name: unique)
  ├── WikiArticle[] (topicId + language: unique compound key)
  ├── ShipLog[] (userId + topicId: unique compound key)
  ├── Tag[] (M:N implicit 관계)
  └── ExpeditionShipLog[] (원정대 공유 토픽)

User (id: Main DB와 동기화)
  ├── ShipLog[]
  ├── ChatHistory[]
  ├── CommsMessage[]
  ├── Follow[] (팔로잉/팔로워, 자기참조)
  ├── Achievement[] (userId + type + tier: unique)
  ├── Expedition[] (소유한 원정대)
  └── ExpeditionMember[] (참여 중인 원정대)

Expedition
  ├── ExpeditionMember[] (userId + expeditionId: unique)
  └── ExpeditionShipLog[] (expeditionId + topicId: unique)
```

### 5.3 접근 제어 (Topic API)

**토픽 상세 조회 시 2단계 접근 체크:**
1. **개인 ShipLog** — 사용자가 직접 발견한 토픽
2. **원정대 ExpeditionShipLog** — 활성 원정대 멤버가 공유한 토픽

둘 다 없으면 **403** 반환.

### 5.4 DM 채널 형식

DM은 별도 모델 없이 `CommsMessage.channel`을 재활용합니다:
- 포맷: `dm:{userId1}_{userId2}` (항상 알파벳 순 정렬)
- SSE 구독: `comms:dm:{userId1}_{userId2}`

### 5.5 Neo4j 그래프

- **Community Edition** 사용 → 다중 데이터베이스 불가, 기본 DB만 사용
- 노드 라벨: `Topic`, `Tag`
- 관계 타입: `MENTIONS` (Topic→Topic), `TAGGED` (Topic→Tag)
- **Ghost 노드**: `ghost: true` 속성. 다른 토픽에서 언급되었으나 자체 위키 미생성. UI에서 "미스터리 노드"(주황색)로 표시
- `topicId` 속성: Prisma UUID와 매핑

---

## 6. 데이터 흐름 — 사용자가 질문할 때

```
1. 사용자 → Console 입력 ("양자역학이 뭐야?")
2. POST /api/chat → { message, language }
3. chat/route.ts:
   a. 인증 확인 (getServerSession)
   b. Rate limit 체크 (3초)
   c. Content DB에 User 존재 확인 (upsert)
   d. ChatHistory에 사용자 메시지 저장
   e. wiki-engine.processUserQuery() 호출
4. wiki-engine.ts:
   a. Topic 검색 (name → alias 폴백)
   b. 최신성 확인 (3개월 기준)
   c. [캐시 미스 시] Gemini AI로 콘텐츠 생성
   d. 마크다운 링크 정규화 ([text](url) → [[text]])
   e. "Unknown" 토픽이면 DB 저장 없이 답변만 반환
   f. KeywordCache로 자동 링크 삽입 ([[keyword]])
   g. withDualTransaction():
      - Prisma: Topic upsert → WikiArticle upsert → Alias upsert
      - Neo4j: syncArticleToGraph() → mergeAliasesToCanonical()
   h. KeywordCache 무효화
   i. ShipLog upsert
5. chat/route.ts:
   f. ChatHistory에 AI 응답 저장
   g. JSON 응답 반환
   h. [finally] checkAndGrantAchievements(userId) — fire-and-forget
```

---

## 7. 실시간 통신 (SSE)

### 아키텍처
```
[클라이언트] ──GET──→ /api/comms/stream?channel={ch} ──→ Server-Sent Events
[클라이언트] ──POST──→ /api/comms ──→ commsPubSub.emit() ──→ 모든 SSE 구독자
```

- `comms-pubsub.ts`: Node.js EventEmitter 기반, `comms:${channel}` 이벤트 키
- Comms / DM / Expedition 채널 모두 동일한 SSE 인프라 사용
- 연결 끊김 시 자동 재연결 (클라이언트 측)

---

## 8. 업적 시스템

### 6종 업적 × 3 티어

| 타입 | 아이콘 | 기준 | 티어 1/2/3 |
|---|---|---|---|
| `first_contact` | ⭐ | 토픽 발견 수 | 1/5/20 |
| `pioneer` | 🚀 | 최초 발견 수 | 1/5/15 |
| `cartographer` | 🗺️ | AI Chat 횟수 | 10/50/200 |
| `social_butterfly` | 📡 | Comms 메시지 수 | 10/50/200 |
| `constellation_maker` | ✨ | 그래프 클러스터 수 | 3/5/10 |
| `deep_diver` | 🌊 | 깊은 연결 수 | 3/5/10 |

### 자동 부여 트리거
- `/api/chat` POST — 토픽 발견 시
- `/api/comms` POST — 메시지 전송 시
- `/api/achievements` GET — 리더보드 조회 시

모두 fire-and-forget 패턴 (응답 속도 미영향).

---

## 9. 인증 시스템

### 전략: JWT (세션 DB 미사용)

- **Google OAuth**: 표준 OAuth 2.0 flow
- **Credentials Provider**: `AGENT_EMAIL` / `AGENT_PASSWORD` 환경변수 기반
  - 비밀번호 비교: SHA-256 해싱 후 `crypto.timingSafeEqual()` (타이밍 공격 방어)
  - **DB에 비밀번호 저장 안 함** — 환경변수 직접 비교

### Session 구조 (확장)
```typescript
session.user.id    // 반드시 존재 (JWT callback에서 token.sub 매핑)
session.user.name  // nullable
session.user.email // nullable
session.user.image // nullable
```

### API 인증 패턴
모든 API 라우트에서 동일한 패턴:
```typescript
const session = await getServerSession(authOptions);
if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
const userId = session.user.id;
```

---

## 10. i18n 규칙

### 번역 키 관리
- 번역 파일: `messages/ko.json`, `messages/en.json`
- **새 UI 텍스트 추가 시 반드시 양쪽 파일 모두 업데이트**
- 네임스페이스: `Metadata`, `Navbar`, `Login`, `Profile`, `ProfileEdit`, `StarMap`, `KnowledgePanel`, `ShipLog`, `Console`, `Explorer`, `Feed`, `DM`, `Expedition`, `Leaderboard`, `NotFound`, `Home`

### 페이지에서 사용법
```typescript
// 서버 컴포넌트
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('StarMap');

// 클라이언트 컴포넌트
import { useTranslations } from 'next-intl';
const t = useTranslations('Console');
```

### 라우팅
- 모든 페이지 경로는 `[locale]` 세그먼트 하위: `/ko/console`, `/en/star-map` 등
- 내부 Link는 반드시 `@/i18n/navigation`의 `Link` 사용 (자동 locale prefix)
- Proxy (`src/proxy.ts`)가 locale 감지 및 리다이렉트 처리

---

## 11. 사이드바 네비게이션

`DashboardLayout.tsx`의 `navigation` 배열:

| 메뉴 | 아이콘 | 경로 | i18n 키 |
|---|---|---|---|
| 항해 일지 | FileText | `/ship-log` | `StarMap.menu.shipLog` |
| 별자리 지도 | Globe | `/` | `StarMap.menu.starMap` |
| 통신 콘솔 | Terminal | `/console` | `StarMap.menu.commsConsole` |
| 발견 피드 | Rss | `/feed` | `StarMap.menu.feed` |
| 직접 통신 | MessageSquare | `/dm` | `StarMap.menu.dm` |
| 원정대 | Rocket | `/expeditions` | `StarMap.menu.expeditions` |
| 리더보드 | Trophy | `/leaderboard` | `StarMap.menu.leaderboard` |

---

## 12. 개발 환경 설정

### 필수 환경변수 (`.env`)
```bash
# SSH 터널 (원격 DB 접근 — 로컬 개발 필수)
SSH_USER, SSH_HOST, SSH_PORT, SSH_KEY_PATH

# MySQL
DATABASE_URL="mysql://user:pass@localhost:3307/main"
DATABASE_CONTENT_URL="mysql://user:pass@localhost:3307/constella"

# Neo4j
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER, NEO4J_PASSWORD

# AI
GOOGLE_GENERATIVE_AI_API_KEY

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
AGENT_EMAIL="agent@test.local"
AGENT_PASSWORD="constella-agent"
```

### 개발 서버 실행
```bash
npm run dev   # tunnel.js를 백그라운드로 실행하고 next dev 시작
```
- `tunnel.js`가 SSH 터널 2개를 생성: MySQL (로컬 3307 → 원격 3306), Neo4j (로컬 7687 → 원격 7687)
- 프로덕션에서는 터널 자동 스킵 (`NODE_ENV=production`)

### Prisma 명령어
```bash
npx prisma generate                                         # Main DB 클라이언트
npx prisma generate --schema=prisma/content/schema.prisma   # Content DB 클라이언트
npx prisma db push --schema=prisma/content/schema.prisma    # 스키마 동기화
npx tsx prisma/seed.ts                                      # 테스트 사용자 시딩
```

### 테스트
```bash
npm test          # Vitest 단위 테스트 실행
npm run test:watch # Vitest watch 모드 (개발 중 자동 재실행)
npm run test:uat  # UAT (Playwright 기반 로그인 테스트)
npm run lint      # ESLint
npm run build     # 프로덕션 빌드 검증
```

### 테스트 인프라 (Vitest)

- **설정 파일**: `vitest.config.ts` — `@/` 경로 별칭, 전역 API, setup 파일 참조
- **전역 Mock**: `src/test/setup.ts` — Prisma(Main/Content), Neo4j, Logger 자동 모킹
- **테스트 파일**: `src/lib/*.test.ts` (예: `gemini.test.ts`, `achievements.test.ts`)
- **새 테스트 추가**: `src/` 하위에 `*.test.ts` 파일 생성 → 전역 mock 자동 적용
- **CI 파이프라인**: `.github/workflows/deploy.yml`에서 `npm test` 자동 실행

---

## 13. 주의사항 및 함정 (Gotchas)

### ❌ 자주 발생하는 실수

1. **Content DB 클라이언트를 Main DB import로 착각**
   - `prisma` (Main) vs `prismaContent` (Content) 혼동 금지
   - `Topic`, `WikiArticle`, `ChatHistory`, `Achievement`, `Expedition` 등은 모두 `prismaContent` 사용

2. **Topic.name 정규화 누락**
   - 항상 `.trim().toLowerCase()` 적용. DB unique 키에 의존하므로 대소문자 불일치 시 중복 생성

3. **WikiArticle 복합 키**
   - `topicId_language`가 unique compound key. upsert 시 반드시 `where: { topicId_language: { topicId, language } }` 사용

4. **Neo4j MERGE 키**
   - `MERGE (n:Topic { name: $name })` — `name` 필드가 유일 식별자. UUID가 아님

5. **i18n 번역 누락**
   - 새 UI 문자열 추가 시 `messages/ko.json`과 `messages/en.json` 모두에 키 추가 필수. 한쪽만 추가하면 런타임 에러

6. **`next-intl` Link vs Next.js Link**
   - `@/i18n/navigation`의 `Link`를 사용해야 locale prefix가 자동 적용됨. `next/link` 사용 시 locale 경로 깨짐

7. **ShipLog + Expedition 접근 제어**
   - Topic API가 ShipLog와 ExpeditionShipLog 존재 여부로 접근 제어 (403). 새 접근 로직 추가 시 이 제약 인지 필요

8. **Content DB User 동기화**
   - Content DB에도 User 테이블이 있음 (id만 저장). API 호출 시 `prismaContent.user.upsert()`로 자동 동기화

9. **Prisma 스키마 변경 후 dev 서버 재시작 필수**
   - `prisma db push` 후 `prisma generate` 실행, 그리고 `npm run dev` 재시작 필요

10. **UserAvatar 이미지 크기**
    - `UserAvatar` 컴포넌트에 `object-cover w-full h-full` 적용 필수. 부모 컨테이너에 `overflow-hidden` 필요

### ⚠️ 아키텍처 제약사항

- **Rate Limiter**: 인메모리 → 다중 인스턴스 배포 시 무효
- **SSE Pub/Sub**: 인메모리 EventEmitter → 단일 프로세스만 지원
- **Neo4j Community Edition**: 다중 데이터베이스 불가, 트랜잭션 제한
- **이중 트랜잭션 실패**: Neo4j 커밋 후 Prisma 실패 시 Ghost 노드 잔류 (의도적 허용)
- **DM 검색**: `CommsMessage.channel LIKE 'dm:%userId%'` 방식 — 대규모 사용자 시 성능 고려 필요

---

## 14. 새 기능 추가 시 체크리스트

### 새 API 엔드포인트 추가
- [ ] `src/app/api/<name>/route.ts` 생성
- [ ] `getServerSession(authOptions)` 인증 추가
- [ ] `checkRateLimit()` 적용 여부 결정
- [ ] Winston logger로 에러 로깅
- [ ] Content DB 접근 시 `prismaContent` 사용 확인

### 새 페이지 추가
- [ ] `src/app/[locale]/<name>/page.tsx` 생성
- [ ] `'use client'` 또는 서버 컴포넌트 결정
- [ ] `DashboardLayout` 래핑 여부 결정
- [ ] `messages/ko.json`과 `messages/en.json`에 번역 키 추가
- [ ] 인증 필요 시 세션 체크 + 리다이렉트

### 새 DB 모델 추가
- [ ] 대상 스키마 파일 수정 (`prisma/schema.prisma` 또는 `prisma/content/schema.prisma`)
- [ ] `npx prisma db push --schema=...` 실행
- [ ] 해당 Prisma 클라이언트 재생성 (`prisma generate --schema=...`)
- [ ] 관련 API 라우트에서 올바른 클라이언트 사용 확인
- [ ] dev 서버 재시작

### DashboardLayout 사이드바에 메뉴 추가
- [ ] `src/components/DashboardLayout.tsx`의 `navigation` 배열에 항목 추가
- [ ] `lucide-react`에서 적절한 아이콘 import
- [ ] 번역 키: `StarMap.menu` 네임스페이스에 추가 (ko + en)

---

## 15. 코드 스타일 및 컨벤션

- **ESLint**: `eslint-config-next` (core-web-vitals + typescript)
- **경로 별칭**: `@/*` → `./src/*`
- **`any` 타입**: 부득이한 경우 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 주석 사용
- **로깅**: `console.log` 대신 `logger.info/warn/error` 사용 (서버 측)
- **에러 응답 형식**: `{ error: 'message' }` + 적절한 HTTP 상태 코드
- **성공 응답 형식**: `{ success: true, data: ... }` 또는 `{ success: true }`
- **Prisma 싱글톤 패턴**: `globalThis` 캐싱으로 HMR 시 연결 누수 방지