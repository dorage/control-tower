
## Bun-First

Node 대신 bun을 사용한다.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Use `Bun.write(path, data)` instead of `node:fs`'s `writeFile`. It creates missing parent directories, so don't call `mkdir` first — only empty directories still need `node:fs`'s `mkdir`.
- Use `Bun.file(path).delete()` instead of `node:fs`'s `unlink`.
- Use `Bun.file(path).bytes()` for raw bytes and `.text()` / `.json()` for decoded content, instead of `node:fs`'s `readFile`.
- `Bun.file(path).exists()` returns **false for a directory**. Don't use it to check that a directory exists — use `node:fs`'s `stat`.
- `node:fs` is still required for directory traversal (`readdir`), metadata (`stat`), atomic `rename`, `mkdir`, `chmod`, and `mkdtemp`. Import it explicitly in those cases only.
- Bun.$`ls` instead of execa.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

그 외에, node 패키지를 사용하기 이전에 bun을 사용할 수 없을지 LLM.txt를 검토한다.
만약, bun 내부 구현을 사용할 때, 아래 문구를 이 파일에 추가한다.

``` markdown
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
```

## 형상관리

- git 으로 관리하는 리포지토리가 아니라면 `형상관리` 규칙들을 무시합니다.
- 조사를 시행하기 이전에 현재 브랜치의 HEAD가 최신인지 확인해요.
- 작업은 항상 브랜치를 생성하고, 해당 브랜치로 워크트리를 생성해서 작업해요.
- 작업을 마무리하면 git으로 커밋, 푸시합니다.
- 현재 작업이 PR 되어 있지 않다면, PR을 작성합니다.
- 커밋 전, 타겟 브랜치의 최근 변경사항을 포함했는지 확인해요.
- 타겟 브랜치의 최근 변경사항이 포함되어 있지 않다면, rebase해서 브랜치를 업데이트해요.

### 브랜치 명명

작업 브랜치는 `<type>/<short-description>` 형식을 사용해요.

- 병렬 작업을 위해 `.claude/worktrees` 아래에 worktree를 만들어서 작업해요.
- `type` 은 conventional commit type 과 일치 (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`)
- `description` 은 kebab-case 로 작성, 50자 이내로 짧고 명확하게
- GitHub 이슈를 기반으로 작업한다면 description 앞에 이슈 번호를 포함: `feat/344-kiosk-cafe-order-api`
- 한글/공백/대문자 사용 금지 (URL·CLI 안정성과 자동화 도구 호환을 위해)
- 예시
  - `feat/m200-period-routes`
  - `fix/fcm-ios-sound`
  - `docs/v3-cafe-order-service-flowchart`
  - `refactor/supplier-query-handler`
  - `chore/python-logging-lib`

AI 에이전트가 자동 생성하는 worktree 브랜치는 `worktree-<short-description>` 또는 `worktree-<type>+<short-description>` 형식으로 만들어지는데, 사람이 PR 을 올릴 때는 위 규칙에 맞게 rename 해서 머지하는 걸 권장해요.


### 커밋

작업을 마무리하면 git으로 커밋해요.

- 하나의 작업이 끝나면 적절한 메시지와 함께 커밋
- conventional commit과 작업범위 작성
- 예시: `<type>(<nx_package_name>):<message>` 포인트 결제 API 구현
- `type` 은 conventional commit type 과 일치 (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`)
- `message` 는 어떻게 가 아닌 변경사유를 담습니다.

## 문서화

다음과 같은 경우 README.md를 업데이트해요.
- 프로젝트 디렉터리 구조 변경
- 설치 방법/가동 전 수동 절차
- package.json script 변경
- 요구사항
- 사전설정

다음이 변경된 경우 docs/ 아래 문서를 업데이트해요.
- 코드 컨벤션 -> `convention.md`
- 테스팅 원칙 -> `testing.md`
- API 엔드포인트 -> `api-endpoint.md`
- API 버저닝 -> `api-vesioning.md`
- 동작 -> `how_it_works.md`

