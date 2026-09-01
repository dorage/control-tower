/**
 * 같은 호스트의 다른 포트에서 도는 서비스로 가는 바로가기 줄.
 *
 * 호스트를 상수로 박지 않는다. 이 페이지를 tailscale IP 로 열었으면 `100.x.y.z:8080`,
 * 라즈베리파이 앞에 앉아 localhost 로 열었으면 `localhost:8080` 이어야 하는데, 지금
 * 이 페이지를 연 호스트를 그대로 쓰면 두 경우가 모두 맞는다. 포트만 다르다는 전제는
 * 여기서 나온다 — 서비스들이 전부 한 대에 떠 있기 때문이다.
 */

export interface QuickLink {
  label: string;
  port: number;
  /** 호버 시 뜨는 한 줄 설명. */
  hint?: string;
  /** 서비스가 루트가 아닌 서브경로에 있을 때만. `/` 로 시작한다. */
  path?: string;
}

/** 바로가기를 늘리려면 이 배열에 한 줄 추가한다. */
const LINKS: QuickLink[] = [{ label: "FreshRSS", port: 8080, hint: "RSS 리더" }];

/**
 * 순수 함수로 빼둔 이유: 링크가 어떤 주소로 향하는지가 이 컴포넌트에서 유일하게
 * 틀릴 수 있는 부분이고, 그것만 테스트하면 된다.
 */
export function quickLinkHref(
  link: QuickLink,
  origin: { protocol: string; hostname: string },
): string {
  // file:// 같은 프로토콜을 그대로 따라가면 주소가 깨진다. http 로 떨어뜨린다.
  const protocol = origin.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${origin.hostname}:${link.port}${link.path ?? ""}`;
}

export function QuickLinks() {
  if (LINKS.length === 0) return null;

  return (
    <nav className="quick-links" aria-label="다른 서비스 바로가기">
      {LINKS.map((link) => (
        <a
          key={`${link.port}${link.path ?? ""}`}
          className="quick-link"
          href={quickLinkHref(link, window.location)}
          title={link.hint}
          // 관제탑 화면을 닫지 않고 다녀오게 한다.
          target="_blank"
          rel="noreferrer"
        >
          <span className="quick-link__label">{link.label}</span>
          <span className="quick-link__port">:{link.port}</span>
        </a>
      ))}
    </nav>
  );
}
