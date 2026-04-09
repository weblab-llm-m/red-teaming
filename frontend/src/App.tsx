import { useState, useEffect } from "react";
import type { AttackCategory, DischargeSummary, TestResult, UserRole } from "./types";
import {
  ATTACK_CATEGORY_MAP,
  ATTACK_TYPES,
  PROVIDERS,
  SYSTEM_PROMPT_TEMPLATES,
  ROLES,
} from "./types";
import { parseCSV } from "./csv";
import { buildSystemPrompt, sendQuery, getProvider } from "./api";
import "./App.css";

const ATTACK_CATEGORIES = [
  {
    id: "privacy",
    label: "プライバシー保護",
    types: ["direct", "impersonation", "indirect", "manipulation"],
  },
  {
    id: "security",
    label: "セキュリティ確保",
    types: ["injection", "roleplay", "stepwise", "context", "multilingual", "obfuscation"],
  },
  {
    id: "harmful",
    label: "有害情報の出力制御",
    types: [
      "harmful_lethal",
      "harmful_illegal",
      "harmful_selfharm",
      "harmful_poison",
      "harmful_avoidance",
    ],
  },
];

function App() {
  const [summaries, setSummaries] = useState<DischargeSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [providerId, setProviderId] = useState("sakura");
  const [model, setModel] = useState(
    PROVIDERS.find((p) => p.id === "sakura")?.defaultModel || PROVIDERS[0].defaultModel,
  );
  const [attackType, setAttackType] = useState("custom");
  const [systemPromptTemplate, setSystemPromptTemplate] = useState(SYSTEM_PROMPT_TEMPLATES.privacy);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>("physician");

  useEffect(() => {
    fetch("/discharge_summary_cleaned.csv")
      .then((res) => res.text())
      .then((text) => {
        const data = parseCSV<DischargeSummary>(text);
        setSummaries(data);
      })
      .catch((err) => {
        setError("データの読み込みに失敗しました: " + err.message);
      });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("redteam_results");
    if (saved) setResults(JSON.parse(saved));

    const savedProvider = localStorage.getItem("redteam_provider");
    if (savedProvider) {
      setProviderId(savedProvider);
      const provider = PROVIDERS.find((p) => p.id === savedProvider);
      if (provider) setModel(provider.defaultModel);
    }

    const savedModel = localStorage.getItem("redteam_model");
    if (savedModel) setModel(savedModel);
  }, []);

  const handleProviderChange = (newProviderId: string) => {
    setProviderId(newProviderId);
    const provider = getProvider(newProviderId);
    setModel(provider.defaultModel);
    localStorage.setItem("redteam_provider", newProviderId);
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    localStorage.setItem("redteam_model", newModel);
  };

  const handleAttackTypeChange = (typeId: string, template: string) => {
    setAttackType(typeId);
    setQuery(template);
    const category = ATTACK_CATEGORY_MAP[typeId] as AttackCategory;
    if (category && category !== "custom") {
      setSystemPromptTemplate(SYSTEM_PROMPT_TEMPLATES[category]);
    }
  };

  useEffect(() => {
    if (results.length > 0) {
      localStorage.setItem("redteam_results", JSON.stringify(results));
    }
  }, [results]);

  const handleSendQuery = async () => {
    if (!query.trim()) {
      setError("クエリを入力してください");
      return;
    }

    setIsLoading(true);
    setError("");
    setResponse("");

    try {
      const summary = summaries[selectedIndex] || null;
      const systemPrompt = buildSystemPrompt(systemPromptTemplate, summary, selectedRole);
      const result = await sendQuery(systemPrompt, query, providerId, model);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJudgment = (leaked: boolean) => {
    const summary = summaries[selectedIndex];
    const newResult: TestResult = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      patientCode: summary.patient_code.slice(0, 16),
      query,
      response,
      leaked,
      notes: "",
    };
    setResults((prev) => [newResult, ...prev]);
    setQuery("");
    setResponse("");
  };

  const handleExport = () => {
    const csv = [
      ["id", "timestamp", "patient_code", "query", "response", "leaked", "notes"].join(","),
      ...results.map((r) =>
        [
          r.id,
          r.timestamp,
          r.patientCode,
          `"${r.query.replace(/"/g, '""')}"`,
          `"${r.response.replace(/"/g, '""')}"`,
          r.leaked,
          `"${r.notes.replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `redteam_manual_results_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const selectedSummary = summaries[selectedIndex];
  const leakedCount = results.filter((r) => r.leaked).length;
  const safeCount = results.length - leakedCount;

  function formatRolePermissions(roleId: UserRole): string {
    const role = ROLES.find((r) => r.id === roleId);
    if (!role) return "";
    const perms: string[] = [];
    if (role.permissions.canViewAllPatients) perms.push("全患者");
    if (role.permissions.canViewDiagnosis) perms.push("診断情報");
    if (role.permissions.canViewPersonalInfo === true) perms.push("個人情報");
    else if (role.permissions.canViewPersonalInfo === "limited") perms.push("個人情報(限定)");
    if (role.permissions.canViewStatistics) perms.push("統計");
    if (role.permissions.canModifyRecords) perms.push("編集");
    if (role.permissions.canViewVipPatients) perms.push("VIP");
    return perms.length > 0 ? perms.join(", ") : "匿名データのみ";
  }

  return (
    <div className="app">
      <div className="main-container">
        <div className="left-panel">
          <section className="section">
            <h2>API 設定</h2>
            <div className="form-group">
              <label className="form-label">プロバイダー</label>
              <select
                className="form-select"
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">モデル</label>
              <select
                className="form-select"
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {PROVIDERS.find((p) => p.id === providerId)?.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="section">
            <h2>ロール選択</h2>
            <div className="form-group">
              <select
                className="form-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              >
                {ROLES.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="role-description">
              {ROLES.find((r) => r.id === selectedRole)?.description}
            </div>
          </section>

          <section className="section">
            <h2>ターゲット患者</h2>
            {summaries.length > 0 ? (
              <select
                className="form-select"
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
              >
                {summaries.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {s.department} / {s.hospitalization_date}
                  </option>
                ))}
              </select>
            ) : (
              <div className="empty-state">
                <div className="loading-spinner" />
                <p>データを読み込み中...</p>
              </div>
            )}
          </section>

          {selectedSummary && (
            <section className="section">
              <h2>コンテキスト</h2>
              <div className="context-display">
                <div className="context-item">
                  <span className="label">患者コード</span>
                  <span className="value">{selectedSummary.patient_code.slice(0, 16)}...</span>
                </div>
                <div className="context-item">
                  <span className="label">入院日</span>
                  <span className="value">{selectedSummary.hospitalization_date}</span>
                </div>
                <div className="context-item">
                  <span className="label">退院日</span>
                  <span className="value">{selectedSummary.discharge_date}</span>
                </div>
                <div className="context-item">
                  <span className="label">診療科</span>
                  <span className="value">{selectedSummary.department}</span>
                </div>
                <div className="context-item">
                  <span className="label">転帰</span>
                  <span className="value">{selectedSummary.outcome}</span>
                </div>
                <div className="context-item full-width">
                  <span className="label">{selectedSummary.summary_article_title_1}</span>
                  <span className="value">{selectedSummary.summary_article_1}</span>
                </div>
                <div className="context-item full-width">
                  <span className="label">{selectedSummary.summary_article_title_2}</span>
                  <span className="value">{selectedSummary.summary_article_2}</span>
                </div>
                <div className="context-item full-width">
                  <span className="label">ロール権限</span>
                  <span className="value">{formatRolePermissions(selectedRole)}</span>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="right-panel">
          <div className="two-column-grid">
            <div className="section-card attack-card">
              <h2>攻撃タイプ</h2>
              {ATTACK_CATEGORIES.map((category) => (
                <div key={category.id} className="attack-category">
                  <div className="attack-category-header">
                    <div className={`attack-category-dot ${category.id}`} />
                    <span className="attack-category-label">{category.label}</span>
                  </div>
                  <div className="attack-types">
                    {category.types.map((typeId) => {
                      const type = ATTACK_TYPES.find((t) => t.id === typeId);
                      if (!type) return null;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          className={`attack-type-btn ${attackType === type.id ? `active ${category.id}` : ""}`}
                          onClick={() => handleAttackTypeChange(type.id, type.template)}
                          title={type.description}
                        >
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="attack-category">
                <div className="attack-category-header">
                  <div
                    className="attack-category-dot"
                    style={{ background: "#a371f7", boxShadow: "0 0 8px #a371f7" }}
                  />
                  <span className="attack-category-label">カスタム</span>
                </div>
                <div className="attack-types">
                  <button
                    type="button"
                    className={`attack-type-btn ${attackType === "custom" ? "active custom" : ""}`}
                    onClick={() => handleAttackTypeChange("custom", "")}
                  >
                    自由入力
                  </button>
                </div>
              </div>
            </div>

            <div className="section-card query-card">
              <h2>攻撃クエリ</h2>
              <textarea
                className="query-textarea"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="攻撃プロンプトを入力..."
              />
              <button
                type="button"
                className="btn btn-primary btn-full btn-send"
                onClick={handleSendQuery}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="loading-spinner" />
                    送信中...
                  </>
                ) : (
                  "送信"
                )}
              </button>
            </div>

            <div className="section-card system-prompt-card">
              <h2>システムプロンプト</h2>
              <textarea
                className="query-textarea system-prompt-textarea"
                value={systemPromptTemplate}
                onChange={(e) => setSystemPromptTemplate(e.target.value)}
                placeholder="システムプロンプトを入力..."
              />
              <p className="prompt-hint">{"{{PATIENT_DATA}}"} → 患者データに置換</p>
            </div>

            <div className="section-card response-card">
              <div className="response-header-row">
                <h2>LLM 応答</h2>
                <div className="response-actions">
                  <span className="stat-compact leaked">{leakedCount}</span>
                  <span className="stat-compact safe">{safeCount}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleExport}
                    disabled={results.length === 0}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm("結果をクリアしますか？")) {
                        setResults([]);
                        localStorage.removeItem("redteam_results");
                      }
                    }}
                    disabled={results.length === 0}
                  >
                    クリア
                  </button>
                </div>
              </div>
              {error && <div className="error-message">{error}</div>}
              {response ? (
                <>
                  <div className="response-body">{response}</div>
                  <div className="judgment-buttons">
                    <button
                      type="button"
                      className="judgment-btn leaked"
                      onClick={() => handleJudgment(true)}
                    >
                      ⚠ 漏洩
                    </button>
                    <button
                      type="button"
                      className="judgment-btn safe"
                      onClick={() => handleJudgment(false)}
                    >
                      ✓ 安全
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-response">応答待ち...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
