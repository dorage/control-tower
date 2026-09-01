# T-024 — 대시보드 상단 서비스 바로가기

| | |
| --- | --- |
| **ID** | T-024 |
| **우선순위** | P2 |
| **영역** | web-core |
| **선행** | T-017 |
| **후행** | 없음 |

## 1. 목적

한 대의 기계(라즈베리파이)에 여러 서비스가 포트만 달리 떠 있다. 관제탑을 tailscale IP 로 열어둔 채 다른 서비스로 건너갈 수 있게 대시보드 맨 위에 바로가기 줄을 둔다. 첫 항목은 8080 의 FreshRSS 다.

## 2. 전제

- 모든 바로가기는 **지금 이 페이지를 연 호스트와 같은 호스트**를 가리킨다. 포트만 다르다.
- 그래서 호스트를 상수로 박지 않고 `window.location` 에서 읽는다. tailscale IP 로 열면 `100.x.y.z:8080`, 기계 앞에서 localhost 로 열면 `localhost:8080` 이 되어 둘 다 맞는다.
- 프로토콜도 페이지를 따른다. 단 `http:`/`https:` 가 아니면(`file:` 등) `http:` 로 떨어뜨린다 — 따라갔다가는 주소가 깨진다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/components/quick-links.tsx` | 링크 목록 상수 + `quickLinkHref` + `QuickLinks` |
| `src/web/components/quick-links.test.ts` | `quickLinkHref` 주소 조립 테스트 |
| `src/web/pages/dashboard.page.tsx` | 대시보드 네 갈래 모두의 맨 위에 배치 |
| `src/web/styles.css` | `.quick-links` / `.quick-link` |

## 4. 상세 명세

### 4.1 목록

```ts
const LINKS: QuickLink[] = [{ label: "FreshRSS", port: 8080, hint: "RSS 리더" }];
```

늘리려면 이 배열에 한 줄 더한다. 서버 설정(환경변수)으로 빼지 않았다 — 그러려면 값을 브라우저로 내려보낼 API 가 하나 더 필요한데, 항목이 `label`·`port` 두 칸뿐이라 그 비용이 값을 하지 못한다. 항목이 사람마다 달라지는 시점에 `/api/quick-links` 로 옮긴다.

`path` 는 서비스가 루트가 아닌 서브경로에 있을 때만 쓴다. 목록이 비면 `QuickLinks` 는 아무것도 렌더하지 않는다.

### 4.2 배치와 동작

- `.dashboard` 의 첫 자식. 통계 타일보다 위다.
- 대시보드의 네 갈래(에러·로딩·빈 상태·정상) **모두**에 넣는다. 세션 데이터가 없거나 `/api/stats` 가 실패한 상황에서도 다른 서비스로는 갈 수 있어야 한다 — 바로가기는 관제탑 데이터에 의존하지 않는다.
- `target="_blank" rel="noreferrer"`. 관제탑 화면(실시간 SSE 연결 포함)을 닫지 않고 다녀온다.
- 링크가 늘어나면 줄바꿈한다. 가로 스크롤을 만들지 않는다.

## 5. 수용 기준

- [x] 대시보드 맨 위에 FreshRSS 칩이 뜨고, 누르면 새 탭에서 `<지금 호스트>:8080` 이 열린다.
- [x] localhost 로 열면 `localhost:8080`, tailscale IP 로 열면 그 IP 의 8080 으로 간다.
- [x] `/api/stats` 실패·로딩·빈 상태에서도 바로가기 줄이 보인다.
- [x] 목록이 비면 줄 자체가 렌더되지 않는다.
- [x] 라이트/다크 모두에서 토큰 색만 쓰고 hex 를 새로 박지 않는다.
- [x] `bun run check` 통과.

## 6. 검증

```bash
bun test src/web/components/quick-links.test.ts
bun run check
```

브라우저에서: 대시보드 상단의 칩, 새 탭 이동, 좁은 폭에서의 줄바꿈.

## 7. 완료 처리

1. `docs/STRUCTURE.md` 트리에 `quick-links.tsx` / `quick-links.test.ts` 추가.
2. `README.md` 화면 표의 `/` 설명에 바로가기 줄 한 줄 추가.
3. `docs/TODO.md` 에 append: `<UTC-ISO> DONE T-024`.
