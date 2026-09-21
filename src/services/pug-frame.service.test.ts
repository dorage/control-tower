import { test, expect } from "bun:test";
import { hostBundle, hostPage } from "./pug-frame.service";
import { PUG_FRAME_HOST_SCRIPT_PATH } from "../web/lib/pug-frame-message";

test("hostPage 는 호스트 스크립트를 모듈로 읽는 고정 HTML 이다", () => {
  const html = hostPage();
  expect(html).toContain(`<script type="module" src="${PUG_FRAME_HOST_SCRIPT_PATH}">`);
  expect(html).toContain('<div id="stage">');
  // 같은 입력이 없으니 같은 출력이어야 한다.
  expect(hostPage()).toBe(html);
});

test(
  "hostBundle 은 canvas 와 우리 호스트 코드를 한 파일로 묶고 같은 것을 다시 돌려준다",
  async () => {
    const first = await hostBundle();
    // 규약 문자열이 번들에 남아 있어야 부모와 말이 통한다.
    expect(first.code).toContain("pug-frame:ready");
    expect(first.code).toContain("pug-frame:render");
    // 외부 import 가 남아 있으면 sandbox iframe 이 CORS 없이 읽지 못한다.
    expect(first.code).not.toMatch(/from\s+["']@pug-frame\/canvas["']/);
    // canvas 가 통째로 들어가면 1MB 를 넘는다. 빠졌으면 수십 KB 다.
    expect(first.code.length).toBeGreaterThan(1_000_000);
    expect(first.etag).toMatch(/^"[0-9a-f]+"$/);

    const second = await hostBundle();
    expect(second).toBe(first);
  },
  20_000,
);

test("hostBundle 은 없는 진입점에서 던지고 캐시를 더럽히지 않는다", async () => {
  await expect(hostBundle("/nonexistent/pug-frame-host.ts")).rejects.toThrow();
  const bundle = await hostBundle();
  expect(bundle.code.length).toBeGreaterThan(1_000_000);
}, 20_000);
