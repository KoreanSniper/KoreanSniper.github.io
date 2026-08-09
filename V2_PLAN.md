# V2 개발 계획

> **기준 문서:** 이 파일을 V2 개발의 단일 기준으로 사용한다. 새로운 기능이나 구조 변경은 먼저 이 계획과 대조하고, 필요하면 계획을 갱신한 뒤 구현한다.
>
> **현재 작업 브랜치:** `refactor/site-restructure`
> **원칙:** `main`은 최종 검증 전까지 수정하지 않는다.

---

## 1. 프로젝트 목표

기존 사이트의 뒤엉킨 구조를 그대로 고치는 대신, V2를 독립 구조로 정리한 뒤 충분히 테스트하고 최종적으로 기존 서비스와 교체한다.

핵심 목표:

- 기능별 책임 분리
- Firebase 의존성 최소화
- 커뮤니티 데이터와 게임 서버의 완전한 분리
- 인증/DB/게임 서버를 독립적으로 운영
- 모바일과 데스크톱에서 안정적으로 동작
- 보안 규칙을 코드가 아닌 서버 측 권한으로 보장
- 테스트가 끝나기 전 `main`에 병합하지 않음

---

## 2. 전체 아키텍처

```text
                         V2 Web Frontend
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        Firebase Auth      Supabase DB      Cloudflare
              │             Community       Game Backend
              │                │                │
        Google Login      ┌────┴────┐      Game API
        Session/UID       │         │      Realtime
                          │         │      Match/Room
                       Community  Reports
                       Posts      Moderation
                       Comments
                       Reactions
                       Profiles
```

### 책임 분리

| 서비스 | 담당 | 담당하지 않는 것 |
|---|---|---|
| Firebase | Google 로그인, 인증 세션, 사용자 UID | 커뮤니티 데이터, 게임 상태 |
| Supabase | 커뮤니티 PostgreSQL DB, RLS, 커뮤니티 실시간 데이터 | 로그인 시스템, 게임 서버 |
| Cloudflare | 게임 서버 API, 실시간 게임 상태, 매치/방 | 커뮤니티 DB, Google 로그인 |
| GitHub Pages | 정적 V2 프론트엔드 배포 | 비밀키/서버 권한 |

---

## 3. 인증 구조

Firebase Authentication을 단일 인증 시스템으로 사용한다.

### 로그인

```text
Google
  ↓
Firebase Authentication
  ↓
Firebase UID + ID Token
  ↓
Supabase 인증 브리지
  ↓
Supabase RLS
```

### 원칙

- Supabase Auth를 별도로 도입하지 않는다.
- Firebase UID를 커뮤니티의 사용자 식별자로 사용한다.
- 브라우저에는 Supabase Publishable Key만 사용한다.
- `service_role` 또는 기타 secret key를 프론트엔드에 넣지 않는다.
- 로그인하지 않은 사용자는 쓰기 작업을 할 수 없다.

---

## 4. Supabase 커뮤니티 DB

현재 기본 스키마:

```text
profiles
├─ id
├─ username
├─ avatar_url
├─ created_at
└─ updated_at

posts
├─ id
├─ author_id
├─ title
├─ content
├─ created_at
└─ updated_at

comments
├─ id
├─ post_id
├─ author_id
├─ content
├─ created_at
└─ updated_at

post_reactions
├─ post_id
├─ user_id
├─ reaction
└─ created_at

comment_reactions
├─ comment_id
├─ user_id
├─ reaction
└─ created_at

reports
├─ id
├─ reporter_id
├─ post_id / comment_id
├─ reason
├─ status
├─ created_at
└─ resolved_at
```

### RLS 원칙

- 공개 게시글/댓글은 읽을 수 있다.
- 게시글은 작성자만 수정/삭제할 수 있다.
- 댓글은 작성자만 수정/삭제할 수 있다.
- 반응은 자기 계정의 반응만 변경할 수 있다.
- 신고는 로그인한 사용자가 생성할 수 있다.
- 일반 사용자는 다른 사용자의 신고 내용을 볼 수 없다.
- 관리자 기능은 별도의 서버 측 권한 검증을 사용한다.

---

## 5. 커뮤니티 기능

### 완료

- [x] 커뮤니티 메인
- [x] 게시글 목록
- [x] 게시글 상세
- [x] 게시글 작성
- [x] 게시글 수정
- [x] 게시글 삭제
- [x] 댓글
- [x] 게시글 좋아요/싫어요 구조
- [x] 댓글 좋아요/싫어요 구조
- [x] 게시글 신고 구조
- [x] 프로필
- [x] 내 게시글
- [x] Firebase Auth 연동
- [x] Supabase 커뮤니티 스키마
- [x] Supabase RLS 기본 정책

### 전환 작업

- [ ] 기존 Firestore API를 Supabase API로 교체
- [ ] 모든 커뮤니티 페이지를 Supabase API로 전환
- [ ] 기존 Firestore 커뮤니티 호출 제거
- [ ] Supabase Realtime 댓글 테스트
- [ ] 좋아요/싫어요 중복 방지 테스트
- [ ] 신고 처리 관리자 UI
- [ ] 게시글 검색
- [ ] 게시글 정렬/필터
- [ ] 페이지네이션

---

## 6. Cloudflare 게임 서버

게임 기능은 커뮤니티와 완전히 분리한다.

예정 담당:

- 게임 세션
- 방 생성/참가
- 실시간 게임 상태
- 매치 관리
- 게임 API
- WebSocket 또는 적절한 실시간 전송 계층
- 서버 측 게임 검증

게임 클라이언트가 결과를 직접 신뢰하지 않도록 서버 권위 구조를 기본으로 한다.

### 금지

- 게임 상태를 Firestore에 저장하지 않는다.
- 커뮤니티 DB를 게임 실시간 상태 저장소로 사용하지 않는다.
- Firebase Auth 코드를 게임 로직에 직접 섞지 않는다.

---

## 7. 프론트엔드 구조

목표 구조:

```text
v2/
├─ index.html
├─ css/
├─ components/
├─ core/
│  ├─ firebase/
│  ├─ supabase/
│  └─ api/
├─ pages/
│  ├─ community/
│  └─ game/
└─ assets/
```

### 원칙

- UI와 데이터 접근 계층을 분리한다.
- Firebase 코드를 커뮤니티 페이지에서 직접 호출하지 않는다.
- Supabase 호출은 `core/api` 계층을 거친다.
- 게임 API도 별도 API 계층을 사용한다.
- 공통 UI는 `components`에 둔다.

---

## 8. 보안

### 필수

- [ ] Supabase RLS 전체 검증
- [ ] Firebase Auth 권한 검증
- [ ] 관리자 권한 서버 측 검증
- [ ] 사용자 간 게시글 수정/삭제 우회 테스트
- [ ] 사용자 간 댓글 수정/삭제 우회 테스트
- [ ] 반응 위조 테스트
- [ ] 신고 위조 테스트
- [ ] IDOR 테스트
- [ ] 입력값 길이/형식 검증
- [ ] XSS 방어 검증
- [ ] 게임 서버 권한 검증

### 비밀정보

절대 Git에 저장하지 않는다:

- `service_role` key
- DB password
- private API secret
- 개인 액세스 토큰

브라우저에는 Publishable Key만 허용한다.

---

## 9. 개발 단계

### Phase 1: 구조 정리

- [x] V2 브랜치 분리
- [x] Firebase Auth 계층 분리
- [x] 커뮤니티 페이지 분리
- [x] 공통 컴포넌트 분리

### Phase 2: 커뮤니티 DB

- [x] Supabase 프로젝트 연결
- [x] PostgreSQL 스키마 생성
- [x] RLS 생성
- [x] Supabase API 계층 생성
- [ ] 기존 Firestore API 제거
- [ ] 브라우저 전체 테스트

### Phase 3: 커뮤니티 완성

- [ ] 관리자 신고 관리
- [ ] 검색/정렬
- [ ] 페이지네이션
- [ ] 모바일 UI 최종화
- [ ] 오류/빈 상태 UI

### Phase 4: 게임 서버

- [ ] Cloudflare 서버 구조 확정
- [ ] 게임 API
- [ ] 방/세션
- [ ] 실시간 상태
- [ ] 서버 검증
- [ ] 부하 테스트

### Phase 5: 통합 테스트

- [ ] 인증 테스트
- [ ] 커뮤니티 CRUD 테스트
- [ ] 권한 테스트
- [ ] 모바일 테스트
- [ ] 게임 연결 테스트
- [ ] 보안 테스트
- [ ] 오류 복구 테스트

### Phase 6: 배포

- [ ] V2 전체 회귀 테스트
- [ ] 실제 Firebase 테스트
- [ ] 실제 Supabase 테스트
- [ ] 실제 Cloudflare 테스트
- [ ] 성능 확인
- [ ] `main` 병합 후보 생성

---

## 10. 테스트 기준

모든 기능은 최소한 다음 상태를 확인한다.

```text
정상 사용자
비로그인 사용자
다른 사용자
잘못된 ID
빈 입력
너무 긴 입력
삭제된 데이터
네트워크 오류
새로고침
세션 만료
모바일 화면
```

커뮤니티 핵심 시나리오:

```text
Google 로그인
 → 프로필 생성
 → 게시글 작성
 → 게시글 조회
 → 댓글 작성
 → 반응 변경
 → 신고
 → 수정
 → 삭제
 → 로그아웃
 → 다른 계정에서 권한 확인
```

---

## 11. 브랜치 정책

### 현재

`refactor/site-restructure`

### 규칙

1. V2 작업은 현재 브랜치에서 진행한다.
2. `main`은 직접 수정하지 않는다.
3. 큰 구조 변경은 `V2_PLAN.md`를 먼저 갱신한다.
4. 새 기능은 구현 후 브라우저 테스트한다.
5. Firebase/Supabase/Cloudflare 중 어느 서비스의 책임을 변경할 때는 이 문서의 아키텍처도 함께 갱신한다.

---

## 12. main 병합 조건

다음 조건을 모두 만족하기 전에는 병합하지 않는다.

- [ ] 커뮤니티 전체 기능 정상
- [ ] Firebase 로그인 정상
- [ ] Supabase RLS 검증 완료
- [ ] 관리자 기능 정상
- [ ] Cloudflare 게임 서버 정상
- [ ] 모바일 UI 정상
- [ ] 보안 테스트 통과
- [ ] 주요 오류 0건
- [ ] 회귀 테스트 통과
- [ ] 실제 배포 환경 테스트 통과

**조건을 하나라도 만족하지 못하면 `main`에 병합하지 않는다.**

---

## 13. 현재 상태

### 현재 작업

**Supabase 커뮤니티 전환**

### 현재 완료

- V2 독립 구조
- Firebase Auth 기반 로그인
- Supabase 커뮤니티 DB
- Supabase RLS
- Supabase API 초안
- Codespaces 브라우저 테스트 환경

### 현재 진행 중

- Firebase Auth → Supabase 인증 브리지
- Firestore → Supabase API 전환
- 커뮤니티 실환경 테스트

### 다음 작업

1. Supabase 인증 브리지 실제 동작 검증
2. 커뮤니티 페이지 전체 API 전환
3. Firestore 커뮤니티 의존성 제거
4. Codespaces 브라우저 회귀 테스트
5. RLS 권한 우회 테스트
6. 관리자 신고 관리

---

## 14. 개발 원칙

> **작동하는 코드를 먼저 만들고, 테스트한 뒤 구조를 정리한다.**
>
> **서비스의 책임을 섞지 않는다.**
>
> **클라이언트의 권한 검사를 서버 보안의 대체품으로 사용하지 않는다.**
>
> **테스트되지 않은 기능은 완료로 표시하지 않는다.**
>
> **`main`은 최종 검증이 끝날 때까지 건드리지 않는다.**
