# T-025 — 세션 뷰 기본값을 대화만으로

| | |
| --- | --- |
| **ID** | T-025 |
| **우선순위** | P2 |
| **영역** | web-session |
| **선행** | T-016 |
| **후행** | 없음 |

## 1. 목적

세션을 열면 사람의 프롬프트와 모델의 답변만 보이게 한다. 툴 입출력·사고 과정·훅
출력·첨부 자리표시·서브에이전트는 기본으로 접고, 필요할 때 토글로 켠다.

실측 근거(세션 `61f3bacc`, 2026-09-02): 전체 229 엔트리 중 `event` 112, `attachment`
40 으로 잡음이 152 개다. 기존 기본값(`events=0`, `sidechain=1`, `thinking=1`,
`tools=1`)으로는 81 엔트리가 남고, 그중 대화 텍스트를 가진 엔트리는 4 개였다. 즉
읽고 싶은 것의 스무 배를 스크롤해야 했다.

## 2. 전제

- 잡음의 절반은 `attachment` 다. 훅 성공 기록(`hook_success`, `hook_additional_context`)
  이 세션마다 수십 개 쌓이고, 실제 트랜스크립트에서 **사용자 프롬프트보다 많은 일이
  흔하다**. 그래서 `events` 토글이 이것까지 함께 다뤄야 목적이 달성된다.
- 서브에이전트 엔트리도 대화이긴 하지만 메인 대화가 아니다. "이 세션에서 무슨 말이
  오갔나"를 읽는 화면의 기본값에서는 뺀다.
- 툴 결과만 든 `user` 엔트리는 `tools` 를 끄면 블록이 전부 사라지고, 블록이 빈 엔트리는
  `TimelineEntryView` 가 `null` 을 반환해 자연히 없어진다. 서버 필터를 새로 만들 필요가 없다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/services/session.service.ts` | `isDialogue` 추가. `includeEvents: false` 의 범위를 `user`/`assistant` 로 좁힘 |
| `src/web/pages/session-detail.page.tsx` | 네 토글 기본값을 모두 끔. 라벨 "시스템 이벤트" → "시스템·첨부" |
| `src/services/session.service.test.ts` | 기본 타임라인에서 `attachment` 가 빠지고 `includeEvents: true` 에 돌아오는지 |
| `docs/ENDPOINTS.md`, `README.md` | 바뀐 기본값과 `events` 의 넓어진 의미 |

## 4. 상세 명세

### 4.1 서버 — `events` 의 범위

`isConversational`(`user`/`assistant`/`system`/`attachment`)은 **그대로 둔다**. 엔트리의
`kind` 와 블록 모양을 정하는 것이 그 함수의 일이고, `events=1` 로 켰을 때 `attachment`
가 `[attachment: hook_success]` 로 보이는 지금 동작이 옳다.

필터만 더 좁은 `isDialogue`(`user`/`assistant`)로 바꾼다.

```ts
if (!includeEvents && !isDialogue(record)) return;
```

그래서 `events=1` 을 켜면 이벤트는 `kind: "event"` 로, `system`·`attachment` 는 각자의
`kind` 로 돌아온다 — 켠 화면의 모양은 이전과 같다.

### 4.2 화면 — 기본값

네 토글 모두 `search.get(x) === "1"`. URL 에 없으면 꺼진 상태다. 켠 상태를 공유하면
링크에 `=1` 이 실린다.

API 자체의 `sidechain` 기본값은 `1` 로 남긴다. API 는 "전체를 준다"가, 화면은 "읽기
편한 것을 준다"가 각각 자연스럽다. 화면은 항상 네 값을 명시해 보내므로 어긋나지 않는다.

## 5. 완수 조건

- [x] 세션을 처음 열면 `user`/`assistant` 엔트리만, 그중 텍스트 블록만 보인다.
- [x] 토글 넷을 켜면 이전과 같은 화면이 나온다.
- [x] `bun run check` 통과 (172 pass).

## 6. 검증

```bash
SID=<세션 id>
# 새 기본값 — user/assistant 만
curl -s "localhost:4317/api/sessions/$SID/timeline?limit=200&events=0&sidechain=0" \
  | grep -o '"kind":"[a-z]*"' | sort | uniq -c
# 전체 — event/attachment 가 돌아온다
curl -s "localhost:4317/api/sessions/$SID/timeline?limit=400&events=1&sidechain=1" \
  | grep -o '"kind":"[a-z]*"' | sort | uniq -c
```

## 7. 되돌리기

`git revert` 한 번. 서버 필터 한 줄과 화면 기본값 네 줄이라 상태가 남지 않는다.
