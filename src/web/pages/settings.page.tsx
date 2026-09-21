import { CodeBlock } from "../components/code-block";
import { CODE_THEMES, setCodeTheme, useCodeTheme, type CodeThemeId } from "../lib/settings";

/**
 * 테마 미리보기용 조각. 언어는 타입스크립트로 고정한다 - 이 도구로 가장 자주 여는 파일이고,
 * 주석·문자열·숫자·예약어·타입·호출·속성이 여덟 줄 안에 모두 들어간다.
 */
const SAMPLE = `// 파일 하나를 읽어 온다
export async function readNote(root: string, path = "README.md") {
  const query = new URLSearchParams({ root, path });
  const res = await fetch(\`/api/fs/file?\${query}\`);
  if (!res.ok) throw new ApiError(res.status, "읽지 못했습니다");
  return { path, lines: 42, editable: true };
}`;

const TONE_LABEL = {
  auto: "자동",
  light: "밝은 테마",
  dark: "어두운 테마",
} as const;

function ThemeCard({
  id,
  label,
  active,
  onPick,
}: {
  id: CodeThemeId;
  label: string;
  active: boolean;
  onPick: (id: CodeThemeId) => void;
}) {
  return (
    <button
      type="button"
      className={active ? "theme-card theme-card--active" : "theme-card"}
      aria-pressed={active}
      onClick={() => onPick(id)}
    >
      <span className="theme-card__head">
        <span className="theme-card__label">{label}</span>
        {active ? <span className="theme-card__check" aria-hidden="true">✓</span> : null}
      </span>
      {/*
        미리보기에도 `data-code-theme` 를 건다. 테마 블록을 `:root` 가 아니라 속성 선택자로
        써 둔 덕분에, 지금 적용 중인 테마와 무관하게 각 카드가 자기 색으로 보인다.
      */}
      <span className="theme-card__preview" data-code-theme={id}>
        <pre className="code-surface">
          <CodeBlock text={SAMPLE} language="typescript" />
        </pre>
      </span>
    </button>
  );
}

export function SettingsPage() {
  const theme = useCodeTheme();

  return (
    <div className="settings">
      <section className="settings__section">
        <h2 className="settings__title">코드 색 테마</h2>
        <p className="settings__hint">
          파일을 원문으로 볼 때와 마크다운 안의 코드 블록에 쓰입니다. 이 브라우저에만 저장되고,
          같은 브라우저의 다른 탭에도 바로 반영됩니다.
        </p>

        {(["auto", "light", "dark"] as const).map((tone) => {
          const themes = CODE_THEMES.filter((candidate) => candidate.tone === tone);
          if (themes.length === 0) return null;
          return (
            <div key={tone} className="settings__group">
              <div className="settings__group-title">{TONE_LABEL[tone]}</div>
              <div className="theme-grid">
                {themes.map((candidate) => (
                  <ThemeCard
                    key={candidate.id}
                    id={candidate.id}
                    label={candidate.label}
                    active={theme === candidate.id}
                    onPick={setCodeTheme}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
