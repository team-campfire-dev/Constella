이 프로젝트는 [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)으로 생성된 [Next.js](https://nextjs.org) 프로젝트입니다.

## 시작하기 (Getting Started)

먼저, 개발 서버를 실행하세요:

```bash
npm run dev
# 또는
yarn dev
# 또는
pnpm dev
# 또는
bun dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 결과를 확인하세요.

`app/page.tsx`를 수정하여 페이지 편집을 시작할 수 있습니다. 파일을 수정하면 페이지가 자동으로 업데이트됩니다.

이 프로젝트는 [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)를 사용하여 Vercel의 새로운 글꼴 제품군인 [Geist](https://vercel.com/font)를 자동으로 최적화하고 로드합니다.

## 더 알아보기 (Learn More)

Next.js에 대해 더 자세히 알아보려면 다음 리소스를 참조하세요:

- [Next.js 문서](https://nextjs.org/docs) - Next.js의 기능과 API에 대해 알아보세요.
- [Next.js 배우기](https://nextjs.org/learn) - 대화형 Next.js 튜토리얼입니다.

[Next.js GitHub 저장소](https://github.com/vercel/next.js)를 확인하실 수 있습니다. 피드백과 기여는 언제나 환영합니다!

## 테스팅 (Testing)

### 로컬 테스트 계정

개발 및 테스트 목적으로 로컬 테스트 계정이 시딩되어 있습니다. 이 계정은 `CredentialsProvider`가 활성화된 경우(특정 하드코딩된 자격 증명을 확인하도록 구성됨)에만 접근할 수 있습니다.

**자격 증명 (Credentials):**
- **이메일/사용자명:** `agent@test.local`
- **비밀번호:** `constella-agent`

### 데이터베이스 시딩

사용자는 `prisma/seed.ts`를 통해 생성됩니다. 사용자를 다시 시딩하거나 존재 여부를 확인하려면 다음 명령어를 실행하세요:
```bash
npx tsx prisma/seed.ts
```

## Vercel에 배포하기 (Deploy on Vercel)

Next.js 앱을 배포하는 가장 쉬운 방법은 Next.js 제작자가 만든 [Vercel 플랫폼](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)을 사용하는 것입니다.

자세한 내용은 [Next.js 배포 문서](https://nextjs.org/docs/app/building-your-application/deploying)를 확인하세요.

## 배포 설정 (Deployment Configuration)

VM 또는 프로덕션 환경에 배포할 때는 `.env` 파일(또는 `docker-compose.yml`)에 환경 변수를 올바르게 설정해야 합니다.

### 로그인 관련 중요 설정 (Critical Settings for Login)

- **`NEXTAUTH_URL`**: 애플리케이션의 공개 URL로 설정해야 합니다 (예: `https://your-domain.com` 또는 `http://your-vm-ip:3000`).
  - 이 값을 `localhost`로 남겨두면, 사용자가 로그인 후 *자신의* 로컬 호스트로 리다이렉트되어 로그인이 실패하게 됩니다.
- **`NEXTAUTH_SECRET`**: 세션 암호화를 위한 임의의 문자열로 설정하세요. `openssl rand -base64 32` 명령어로 생성할 수 있습니다.

### 데이터베이스 연결 (Docker에서 호스트로)

데이터베이스가 호스트 머신(Docker 외부)에서 실행 중인 경우, `DATABASE_URL`에 `localhost`를 사용할 수 없습니다.
- `host.docker.internal` (docker-compose에 설정된 경우) 또는 Docker 게이트웨이 IP (`172.17.0.1`)를 사용하세요.
- 예시: `DATABASE_URL="mysql://user:pass@host.docker.internal:3306/db_name"`

### Google OAuth

Google Cloud Console 자격 증명(Credentials)에서 올바른 리다이렉트 URI를 허용하는지 확인하세요:
- **승인된 리다이렉트 URI**: `http://<YOUR_DOMAIN_OR_IP>:3000/api/auth/callback/google`
