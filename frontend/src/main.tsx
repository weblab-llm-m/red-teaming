import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ReportViewer from "./ReportViewer.tsx";

type Tab = "test" | "report";

function Layout() {
  const [activeTab, setActiveTab] = useState<Tab>("test");

  return (
    <div className="layout">
      <header className="global-header">
        <div className="header-left">
          <div className="header-logo">RT</div>
          <h1>医療 LLM レッドチーミング</h1>
          <nav className="header-nav">
            <button
              className={activeTab === "test" ? "nav-tab active" : "nav-tab"}
              onClick={() => setActiveTab("test")}
            >
              テスト
            </button>
            <button
              className={activeTab === "report" ? "nav-tab active" : "nav-tab"}
              onClick={() => setActiveTab("report")}
            >
              レポート
            </button>
          </nav>
        </div>
      </header>
      {activeTab === "test" ? <App /> : <ReportViewer />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Layout />
  </StrictMode>,
);
