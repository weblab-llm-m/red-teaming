import { useState, useEffect } from "react";

interface Report {
  name: string;
  path: string;
}

interface ModelInfo {
  provider: string;
  model: string;
  tests: number;
  leaks: number;
  leak_rate: number;
}

interface AisiDetail {
  model: string;
  category: string;
  tests: number;
  leaks: number;
  leak_rate: number;
}

interface AttackType {
  model: string;
  attack_type: string;
  tests: number;
  leaks: number;
  leak_rate: number;
}

interface LeakedTest {
  model: string;
  test_id: string;
  attack_type: string;
  description: string;
}

interface TestCase {
  model: string;
  test_id: string;
  attack_type: string;
  description: string;
  query: string;
  response: string;
  leaked: boolean;
}

interface ReportData {
  generated_at: string;
  models: ModelInfo[];
  evaluation: { aspect: string; results: Record<string, string> }[];
  aisi_details: AisiDetail[];
  attack_types: AttackType[];
  leaked_tests: LeakedTest[];
  test_cases?: TestCase[];
  conclusion: string;
}

function getRateClass(leakRate: number): string {
  if (leakRate >= 30) return "grade-fail";
  if (leakRate > 10) return "grade-warn";
  return "grade-pass";
}

const CATEGORY_ATTACK_TYPES: Record<string, string[]> = {
  プライバシー保護: ["direct", "impersonation", "indirect", "stepwise", "manipulation"],
  セキュリティ確保: ["injection", "roleplay", "debug_mode", "template_exploit", "backup_restore"],
  有害情報の出力制御: [
    "harmful_lethal",
    "harmful_illegal",
    "harmful_selfharm",
    "harmful_poison",
    "harmful_avoidance",
  ],
};

function normalizeProvider(provider: string): string {
  return provider.startsWith("weblab") ? "weblab" : provider;
}

function splitProviderModel(key: string): { provider: string; model: string } {
  const idx = key.indexOf("/");
  if (idx < 0) return { provider: "", model: key };
  return { provider: key.slice(0, idx), model: key.slice(idx + 1) };
}

const ASPECT_KEYS = ["プライバシー保護", "セキュリティ確保", "有害情報の出力制御"];

export default function ReportViewer() {
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalDetail, setModalDetail] = useState<AisiDetail | null>(null);
  const [modalTestCase, setModalTestCase] = useState<TestCase | null>(null);

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedReport.split("/").pop() ?? "report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetch("/reports/index.json")
      .then((res) => {
        if (!res.ok) throw new Error("レポート一覧の読み込みに失敗しました");
        return res.json() as Promise<{ reports: Report[] }>;
      })
      .then((data) => {
        setReports(data.reports);
        if (data.reports.length > 0) {
          setSelectedReport(data.reports[0].path);
        }
        setReportsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setReportsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedReport) return;
    setIsLoading(true);
    setError("");
    fetch(selectedReport)
      .then((res) => {
        if (!res.ok) throw new Error("レポートの読み込みに失敗しました");
        return res.json() as Promise<ReportData>;
      })
      .then((data) => {
        setReport(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [selectedReport]);

  const modelNames = report?.evaluation[0]
    ? Object.keys(report.evaluation[0].results).sort((a, b) => {
        const pa = normalizeProvider(splitProviderModel(a).provider);
        const pb = normalizeProvider(splitProviderModel(b).provider);
        if (pa !== pb) return pa.localeCompare(pb);
        return splitProviderModel(a).model.localeCompare(splitProviderModel(b).model);
      })
    : [];

  const getAttackTypesForModal = (detail: AisiDetail) => {
    const categoryAttackTypes = CATEGORY_ATTACK_TYPES[detail.category] ?? [];
    return (report?.attack_types ?? []).filter(
      (a) => a.model === detail.model && categoryAttackTypes.includes(a.attack_type),
    );
  };

  const getTestCasesForModal = (detail: AisiDetail) => {
    const categoryAttackTypes = CATEGORY_ATTACK_TYPES[detail.category] ?? [];
    return (report?.test_cases ?? []).filter(
      (t) => t.model === detail.model && categoryAttackTypes.includes(t.attack_type),
    );
  };

  return (
    <div className="report-dashboard">
      {isLoading && <div className="dashboard-loading">読み込み中...</div>}
      {error && <div className="dashboard-error">{error}</div>}

      {!isLoading && !error && report && (
        <div className="dashboard-content">
          <div className="left-column">
            <div className="report-header">
              <select
                className="report-select"
                value={selectedReport}
                onChange={(e) => setSelectedReport(e.target.value)}
                disabled={reportsLoading || reports.length === 0}
              >
                {reportsLoading ? (
                  <option value="">読み込み中...</option>
                ) : reports.length === 0 ? (
                  <option value="">レポートがありません</option>
                ) : (
                  reports.map((r) => (
                    <option key={r.path} value={r.path}>
                      {r.name}
                    </option>
                  ))
                )}
              </select>
              <button className="json-download-btn" onClick={handleDownloadJson} disabled={!report}>
                ↓
              </button>
            </div>
            <div className="report-date">{report.generated_at}</div>

            <div className="model-failure-rates">
              <div className="section-title">モデル別失敗率</div>
              <div className="failure-list">
                {[...report.models]
                  .sort((a, b) => {
                    const pa = normalizeProvider(a.provider);
                    const pb = normalizeProvider(b.provider);
                    if (pa !== pb) return pa.localeCompare(pb);
                    return a.leak_rate - b.leak_rate;
                  })
                  .map((m) => (
                    <div key={`${m.provider}-${m.model}`} className="failure-item">
                      <span className="failure-provider">{normalizeProvider(m.provider)}</span>
                      <span className="failure-model">{m.model}</span>
                      <div className="failure-bar-container">
                        <div
                          className={`failure-bar ${m.leak_rate >= 30 ? "high" : m.leak_rate > 10 ? "mid" : "low"}`}
                          style={{ width: `${Math.max(m.leak_rate, 1)}%` }}
                        />
                      </div>
                      <span className={`failure-rate ${m.leaks > 0 ? "warn" : "pass"}`}>
                        {m.leak_rate}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="leaked-tests">
              <div className="section-title">検知された漏洩</div>
              {report.leaked_tests.length > 0 ? (
                <div className="leaked-list">
                  {report.leaked_tests.map((t) => {
                    const testCase = report.test_cases?.find(
                      (tc) => tc.model === t.model && tc.test_id === t.test_id,
                    );
                    return (
                      <div
                        key={`${t.model}-${t.test_id}`}
                        className={`leaked-item ${testCase ? "clickable" : ""}`}
                        onClick={() => testCase && setModalTestCase(testCase)}
                      >
                        <span className="leaked-id">{t.test_id}</span>
                        <span className="leaked-type">{t.attack_type}</span>
                        <span className="leaked-model">{splitProviderModel(t.model).model}</span>
                        <span className="leaked-desc">{t.description}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-leaks">漏洩なし</div>
              )}
            </div>
          </div>

          <div className="center-column">
            <table className="details-table">
              <thead>
                <tr>
                  <th className="provider-th">プロバイダー</th>
                  <th className="model-th">モデル</th>
                  {ASPECT_KEYS.map((cat) => (
                    <th key={cat}>{cat}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelNames.map((name) => {
                  const modelDetails = report.aisi_details.filter((d) => d.model === name);
                  const { provider, model } = splitProviderModel(name);
                  return (
                    <tr key={name}>
                      <td className="provider-td">{normalizeProvider(provider)}</td>
                      <td className="model-td" title={name}>
                        {model}
                      </td>
                      {ASPECT_KEYS.map((cat) => {
                        const d = modelDetails.find((md) => md.category === cat);
                        if (!d) return <td key={cat} />;
                        return (
                          <td
                            key={cat}
                            className={`aspect-td ${getRateClass(d.leak_rate)} clickable`}
                            onClick={() => setModalDetail(d)}
                          >
                            <span className="detail-stat">
                              {d.leaks}/{d.tests}
                            </span>
                            <span className="detail-rate">{d.leak_rate}%</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalDetail && (
        <div className="modal-overlay" onClick={() => setModalDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{splitProviderModel(modalDetail.model).model}</h3>
              <span className={`modal-grade ${getRateClass(modalDetail.leak_rate)}`}>
                {modalDetail.category}: {modalDetail.leak_rate}%
              </span>
              <button className="modal-close" onClick={() => setModalDetail(null)}>
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-summary">
                {modalDetail.leaks}/{modalDetail.tests} 漏洩 ({modalDetail.leak_rate}%)
              </div>
              {report?.test_cases ? (
                <div className="test-cases-list">
                  {getTestCasesForModal(modalDetail).map((t) => (
                    <div key={t.test_id} className={`test-case ${t.leaked ? "leaked" : "safe"}`}>
                      <div className="test-case-header">
                        <span className="test-case-id">{t.test_id}</span>
                        <span className="test-case-type">{t.attack_type}</span>
                        <span className={`test-case-result ${t.leaked ? "fail" : "pass"}`}>
                          {t.leaked ? "漏洩" : "防御"}
                        </span>
                      </div>
                      <div className="test-case-desc">{t.description}</div>
                      <div className="test-case-section">
                        <div className="test-case-label">プロンプト</div>
                        <div className="test-case-content">{t.query}</div>
                      </div>
                      <div className="test-case-section">
                        <div className="test-case-label">レスポンス</div>
                        <div className="test-case-content">{t.response}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <table className="modal-table">
                  <thead>
                    <tr>
                      <th>攻撃タイプ</th>
                      <th>結果</th>
                      <th>漏洩率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getAttackTypesForModal(modalDetail).map((a) => (
                      <tr key={a.attack_type} className={a.leaks > 0 ? "leaked" : "safe"}>
                        <td>{a.attack_type}</td>
                        <td>
                          {a.leaks > 0 ? (
                            <span className="result-fail">
                              {a.leaks}/{a.tests} 漏洩
                            </span>
                          ) : (
                            <span className="result-pass">
                              {a.tests}/{a.tests} 防御
                            </span>
                          )}
                        </td>
                        <td>{a.leak_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {modalTestCase && (
        <div className="modal-overlay" onClick={() => setModalTestCase(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalTestCase.test_id}</h3>
              <span className={`modal-grade ${modalTestCase.leaked ? "grade-fail" : "grade-pass"}`}>
                {modalTestCase.leaked ? "漏洩" : "防御"}
              </span>
              <button className="modal-close" onClick={() => setModalTestCase(null)}>
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-summary">
                {splitProviderModel(modalTestCase.model).model} / {modalTestCase.attack_type}
              </div>
              <div className="test-case-desc">{modalTestCase.description}</div>
              <div className="test-case-section">
                <div className="test-case-label">プロンプト</div>
                <div className="test-case-content">{modalTestCase.query}</div>
              </div>
              <div className="test-case-section">
                <div className="test-case-label">レスポンス</div>
                <div className="test-case-content">{modalTestCase.response}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
