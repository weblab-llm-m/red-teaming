import type { DischargeSummary, ProviderConfig, UserRole, RoleConfig } from "./types";
import { PROVIDERS, ROLE_SYSTEM_PROMPT_PREFIX, ROLES } from "./types";

export function formatPatientData(summary: DischargeSummary): string {
  return `患者コード: ${summary.patient_code.slice(0, 16)}...
入院日: ${summary.hospitalization_date}
退院日: ${summary.discharge_date}
診療科: ${summary.department}
転帰: ${summary.outcome}

${summary.summary_article_title_1}: ${summary.summary_article_1}
${summary.summary_article_title_2}: ${summary.summary_article_2}
${summary.summary_article_title_3}: ${summary.summary_article_3}
${summary.summary_article_title_4}: ${summary.summary_article_4}`;
}

export function formatPatientDataForRole(summary: DischargeSummary, role: RoleConfig): string {
  const lines: string[] = [];

  if (role.permissions.canViewPersonalInfo === true) {
    lines.push(`患者コード: ${summary.patient_code.slice(0, 16)}...`);
  } else if (role.permissions.canViewPersonalInfo === "limited") {
    lines.push(`患者コード: [アクセス制限]`);
  } else {
    lines.push(`患者コード: [匿名化済み]`);
  }

  lines.push(`入院日: ${summary.hospitalization_date}`);
  lines.push(`退院日: ${summary.discharge_date}`);
  lines.push(`診療科: ${summary.department}`);
  lines.push(`転帰: ${summary.outcome}`);
  lines.push("");

  if (role.permissions.canViewDiagnosis) {
    lines.push(`${summary.summary_article_title_1}: ${summary.summary_article_1}`);
    lines.push(`${summary.summary_article_title_2}: ${summary.summary_article_2}`);
    lines.push(`${summary.summary_article_title_3}: ${summary.summary_article_3}`);
    lines.push(`${summary.summary_article_title_4}: ${summary.summary_article_4}`);
  } else {
    lines.push(`${summary.summary_article_title_1}: [診断情報へのアクセス権限がありません]`);
    lines.push(`${summary.summary_article_title_2}: [診断情報へのアクセス権限がありません]`);
  }

  return lines.join("\n");
}

export function buildSystemPrompt(
  template: string,
  summary: DischargeSummary | null,
  roleId?: UserRole,
): string {
  let prompt = template;

  if (roleId) {
    const role = ROLES.find((r) => r.id === roleId);
    if (role) {
      const rolePrefix = ROLE_SYSTEM_PROMPT_PREFIX[roleId];
      prompt = rolePrefix + "\n\n" + prompt;

      if (summary) {
        const patientData = formatPatientDataForRole(summary, role);
        prompt = prompt.replace("{{PATIENT_DATA}}", patientData);
        return prompt;
      }
    }
  }

  if (summary) {
    const patientData = formatPatientData(summary);
    prompt = prompt.replace("{{PATIENT_DATA}}", patientData);
  }

  return prompt;
}

export function getProvider(providerId: string): ProviderConfig {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`未対応のプロバイダー: ${providerId}`);
  }
  return provider;
}

export async function sendQuery(
  systemPrompt: string,
  userQuery: string,
  providerId: string,
  model: string,
): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: providerId,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery },
      ],
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string } | string;
    choices?: Array<{ message: { content: string } }>;
  };

  if (!response.ok) {
    const errorMsg = typeof data.error === "object" ? data.error?.message : data.error;
    throw new Error(errorMsg || "API エラーが発生しました");
  }

  return data.choices?.[0]?.message?.content || "";
}
