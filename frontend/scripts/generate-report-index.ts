import * as fs from "node:fs";
import * as path from "node:path";

interface ReportEntry {
  name: string;
  path: string;
}

interface ReportIndex {
  reports: ReportEntry[];
}

const REPORTS_DIR = path.resolve(import.meta.dirname, "../public/reports");
const OUTPUT_FILE = path.join(REPORTS_DIR, "index.json");
const REPORT_PATTERN = /^redteam_report_(\d{4}-\d{2}-\d{2}(?:_\d{6})?)\.json$/;

function generateReportIndex(): void {
  const files = fs.readdirSync(REPORTS_DIR);

  const reports: ReportEntry[] = files
    .map((filename) => {
      const match = filename.match(REPORT_PATTERN);
      if (!match) return null;
      return {
        name: match[1],
        path: `/reports/${filename}`,
      };
    })
    .filter((entry): entry is ReportEntry => entry !== null)
    .sort((a, b) => b.name.localeCompare(a.name));

  const index: ReportIndex = { reports };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2) + "\n");

  console.log(`Generated ${OUTPUT_FILE} with ${reports.length} reports`);
}

generateReportIndex();
