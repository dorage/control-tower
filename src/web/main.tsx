import { createRoot } from "react-dom/client";
import { App } from "./app";
import { applyCodeTheme } from "./lib/settings";
import "./styles.css";

// 첫 렌더 전에 적용한다. React 상태로만 들고 있으면 한 프레임 동안 기본 색이 비친다.
applyCodeTheme();

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
