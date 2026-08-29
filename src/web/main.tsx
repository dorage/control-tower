import { createRoot } from "react-dom/client";
import "./styles.css";

// T-011 이 ./app 으로 옮긴다.
function App() {
  return <div className="app">control tower</div>;
}

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
