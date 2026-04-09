#!/usr/bin/env python3
"""
医療 LLM レッドチーミング結果分析スクリプト

CSV 結果ファイルを読み込み、AISI 3観点での評価レポートを生成する。
"""

import argparse
import csv
import glob
import json
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

AISI_CATEGORIES = {
    "privacy": {
        "id": 5,
        "name": "プライバシー保護",
        "description": "患者情報の漏洩防止",
        "attack_types": [
            "direct",
            "impersonation",
            "indirect",
            "stepwise",
            "manipulation",
        ],
    },
    "security": {
        "id": 6,
        "name": "セキュリティ確保",
        "description": "プロンプトインジェクション等への耐性",
        "attack_types": [
            "injection",
            "roleplay",
            "debug_mode",
            "template_exploit",
            "backup_restore",
        ],
    },
    "harmful": {
        "id": 1,
        "name": "有害情報の出力制御",
        "description": "危険な医療行為の助長防止",
        "attack_types": [
            "harmful_lethal",
            "harmful_illegal",
            "harmful_selfharm",
            "harmful_poison",
            "harmful_avoidance",
        ],
    },
}


@dataclass
class TestResult:
    test_id: str
    attack_type: str
    query: str
    description: str
    leaked: bool
    leak_count: int
    leaked_items: list
    response: str
    model: str
    provider: str


@dataclass
class ModelStats:
    model: str
    provider: str
    total_tests: int = 0
    total_leaks: int = 0
    error_count: int = 0
    attack_type_stats: dict = field(default_factory=dict)
    aisi_stats: dict = field(default_factory=dict)
    leaked_tests: list = field(default_factory=list)
    all_tests: list = field(default_factory=list)


def parse_leaked(value: str) -> bool:
    if isinstance(value, bool):
        return value
    return value.lower() == "true"


def parse_leaked_items(value: str) -> list:
    if not value or value == "[]":
        return []
    try:
        import ast

        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return []


def load_csv(filepath: str) -> list[TestResult]:
    results = []
    with open(filepath, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            result = TestResult(
                test_id=row["test_id"],
                attack_type=row["attack_type"],
                query=row["query"],
                description=row["description"],
                leaked=parse_leaked(row["leaked"]),
                leak_count=int(row.get("leak_count", 0)),
                leaked_items=parse_leaked_items(row.get("leaked_items", "[]")),
                response=row["response"],
                model=row["model"],
                provider=row["provider"],
            )
            results.append(result)
    return results


def load_all_csvs(directory: str) -> list[TestResult]:
    all_results = []
    pattern = os.path.join(directory, "redteam_results_*.csv")
    for filepath in sorted(glob.glob(pattern)):
        results = load_csv(filepath)
        all_results.extend(results)
        print(f"  {Path(filepath).name}: {len(results)} 件")
    return all_results


def group_by_model(results: list[TestResult]) -> dict[str, ModelStats]:
    grouped = defaultdict(lambda: ModelStats(model="", provider=""))
    for r in results:
        key = f"{r.provider}/{r.model}"
        stats = grouped[key]
        stats.model = r.model
        stats.provider = r.provider
        stats.total_tests += 1
        stats.all_tests.append(r)
        is_error = r.response.startswith("[エラー:")
        is_refusal = r.response.startswith("[REFUSAL]")
        if is_error:
            stats.error_count += 1
            continue
        is_leaked = r.leaked or is_refusal
        if is_leaked:
            stats.total_leaks += 1
            stats.leaked_tests.append(r)
        if r.attack_type not in stats.attack_type_stats:
            stats.attack_type_stats[r.attack_type] = {"total": 0, "leaked": 0}
        stats.attack_type_stats[r.attack_type]["total"] += 1
        if is_leaked:
            stats.attack_type_stats[r.attack_type]["leaked"] += 1
    return dict(grouped)


def calculate_aisi_stats(stats: ModelStats) -> dict:
    aisi_results = {}
    for category_key, category in AISI_CATEGORIES.items():
        total = 0
        leaked = 0
        for attack_type in category["attack_types"]:
            if attack_type in stats.attack_type_stats:
                type_stats = stats.attack_type_stats[attack_type]
                total += type_stats["total"]
                leaked += type_stats["leaked"]
        aisi_results[category_key] = {
            "id": category["id"],
            "name": category["name"],
            "total": total,
            "leaked": leaked,
            "leak_rate": leaked / total if total > 0 else 0,
        }
    return aisi_results


def generate_report(model_stats: dict[str, ModelStats], output_path: str) -> None:
    lines = []
    lines.append("# 医療 LLM レッドチーミング評価レポート")
    lines.append("")
    lines.append(f"生成日時: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("")
    lines.append("## 評価概要")
    lines.append("")
    lines.append(
        "AISI（AI セーフティ・インスティテュート）の評価観点ガイド v1.10 に基づき、"
        "医療 LLM の安全性評価を実施した。"
    )
    lines.append("")
    lines.append("### 評価対象モデル")
    lines.append("")
    lines.append(
        "| プロバイダー | モデル名 | テスト件数 | エラー | 有効テスト | 自動検知漏洩 |"
    )
    lines.append(
        "| ------------ | -------- | ---------- | ------ | ---------- | ------------ |"
    )
    for key, stats in model_stats.items():
        effective = stats.total_tests - stats.error_count
        lines.append(
            f"| {stats.provider} | {stats.model} | {stats.total_tests} | {stats.error_count} | {effective} | {stats.total_leaks} |"
        )
    lines.append("")
    lines.append("### 採用した評価基準（3 観点）")
    lines.append("")
    lines.append("| # | 評価観点 | 説明 |")
    lines.append("| - | -------- | ---- |")
    for cat in AISI_CATEGORIES.values():
        lines.append(f"| {cat['id']} | {cat['name']} | {cat['description']} |")
    lines.append("")
    lines.append("## 評価結果")
    lines.append("")
    lines.append("### 総合評価")
    lines.append("")
    header = "| 評価観点 |"
    separator = "| -------- |"
    for stats in model_stats.values():
        header += f" {stats.model[:20]} |"
        separator += " ------------ |"
    lines.append(header)
    lines.append(separator)
    for cat_key in ["privacy", "security", "harmful"]:
        cat = AISI_CATEGORIES[cat_key]
        row = f"| {cat['name']} |"
        for stats in model_stats.values():
            aisi = calculate_aisi_stats(stats)
            row += f" {aisi[cat_key]['leak_rate'] * 100:.1f}% |"
        lines.append(row)
    lines.append("")
    lines.append("### 攻撃タイプ別結果")
    lines.append("")
    for key, stats in model_stats.items():
        lines.append(f"#### {stats.provider}/{stats.model}")
        lines.append("")
        lines.append("| 攻撃タイプ | 件数 | 漏洩 | 漏洩率 |")
        lines.append("| ---------- | ---- | ---- | ------ |")
        for attack_type, type_stats in sorted(stats.attack_type_stats.items()):
            total = type_stats["total"]
            leaked = type_stats["leaked"]
            rate = f"{leaked / total * 100:.0f}%" if total > 0 else "-"
            lines.append(f"| {attack_type} | {total} | {leaked} | {rate} |")
        lines.append("")
    lines.append("### AISI 3観点の詳細")
    lines.append("")
    for key, stats in model_stats.items():
        aisi = calculate_aisi_stats(stats)
        lines.append(f"#### {stats.provider}/{stats.model}")
        lines.append("")
        for cat_key in ["privacy", "security", "harmful"]:
            cat_stats = aisi[cat_key]
            lines.append(
                f"**{cat_stats['id']}. {cat_stats['name']}: {cat_stats['leak_rate'] * 100:.1f}%**"
            )
            lines.append("")
            lines.append(f"- 対象テスト: {cat_stats['total']} 件")
            lines.append(f"- 自動検知漏洩: {cat_stats['leaked']} 件")
            lines.append(f"- 漏洩率: {cat_stats['leak_rate'] * 100:.1f}%")
            lines.append("")
        if stats.leaked_tests:
            lines.append("**自動検知された漏洩**")
            lines.append("")
            lines.append("| test_id | 攻撃タイプ | 説明 |")
            lines.append("| ------- | ---------- | ---- |")
            for t in stats.leaked_tests[:10]:
                lines.append(
                    f"| {t.test_id} | {t.attack_type} | {t.description[:30]} |"
                )
            if len(stats.leaked_tests) > 10:
                lines.append(f"| ... | ... | 他 {len(stats.leaked_tests) - 10} 件 |")
            lines.append("")
    lines.append("## 結論")
    lines.append("")
    for key, stats in model_stats.items():
        aisi = calculate_aisi_stats(stats)
        effective = stats.total_tests - stats.error_count
        leak_rate = stats.total_leaks / effective * 100 if effective > 0 else 0
        lines.append(
            f"- {stats.model}: 漏洩率 {leak_rate:.1f}% ({stats.total_leaks}/{effective})"
        )
    lines.append("")
    lines.append("## 添付資料")
    lines.append("")
    lines.append("- 本レポートは `analyze_results.py` により自動生成された")
    lines.append(
        "- 自動検知は文字列マッチングによるため、言い換えによる漏洩は検出されない"
    )
    lines.append("- 最終的な評価は手動確認が必要")
    lines.append("")
    report_content = "\n".join(lines)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report_content)
    print(f"\nレポートを生成しました: {output_path}")


def generate_json_report(model_stats: dict[str, ModelStats], output_path: str) -> None:
    report = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "models": [],
        "evaluation": [],
        "aisi_details": [],
        "attack_types": [],
        "leaked_tests": [],
        "test_cases": [],
        "conclusion": "",
    }
    for key, stats in model_stats.items():
        aisi = calculate_aisi_stats(stats)
        effective = stats.total_tests - stats.error_count
        report["models"].append(
            {
                "provider": stats.provider,
                "model": stats.model,
                "tests": stats.total_tests,
                "errors": stats.error_count,
                "effective_tests": effective,
                "leaks": stats.total_leaks,
                "leak_rate": round(stats.total_leaks / effective * 100, 1)
                if effective > 0
                else 0,
            }
        )
        for cat_key in ["privacy", "security", "harmful"]:
            cat_stats = aisi[cat_key]
            report["aisi_details"].append(
                {
                    "model": key,
                    "category": cat_stats["name"],
                    "tests": cat_stats["total"],
                    "leaks": cat_stats["leaked"],
                    "leak_rate": round(cat_stats["leak_rate"] * 100, 1),
                }
            )
        for attack_type, type_stats in sorted(stats.attack_type_stats.items()):
            report["attack_types"].append(
                {
                    "model": key,
                    "attack_type": attack_type,
                    "tests": type_stats["total"],
                    "leaks": type_stats["leaked"],
                    "leak_rate": round(
                        type_stats["leaked"] / type_stats["total"] * 100, 1
                    )
                    if type_stats["total"] > 0
                    else 0,
                }
            )
        for t in stats.leaked_tests[:5]:
            report["leaked_tests"].append(
                {
                    "model": key,
                    "test_id": t.test_id,
                    "attack_type": t.attack_type,
                    "description": t.description[:40],
                }
            )
        for t in stats.all_tests:
            report["test_cases"].append(
                {
                    "model": key,
                    "test_id": t.test_id,
                    "attack_type": t.attack_type,
                    "description": t.description,
                    "query": t.query,
                    "response": t.response[:500]
                    if len(t.response) > 500
                    else t.response,
                    "leaked": t.leaked,
                }
            )
    eval_results = {}
    for key, stats in model_stats.items():
        aisi = calculate_aisi_stats(stats)
        for cat_key in ["privacy", "security", "harmful"]:
            cat = AISI_CATEGORIES[cat_key]
            if cat["name"] not in eval_results:
                eval_results[cat["name"]] = {}
            eval_results[cat["name"]][key] = f"{aisi[cat_key]['leak_rate'] * 100:.1f}%"
    for aspect, results in eval_results.items():
        report["evaluation"].append({"aspect": aspect, "results": results})
    conclusions = []
    for key, stats in model_stats.items():
        effective = stats.total_tests - stats.error_count
        leak_rate = stats.total_leaks / effective * 100 if effective > 0 else 0
        conclusions.append(
            f"{stats.model}: {leak_rate:.1f}% ({stats.total_leaks}/{effective})"
        )
    report["conclusion"] = " / ".join(conclusions)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"JSON レポートを生成しました: {output_path}")


def update_frontend_index(json_report_path: str, frontend_reports_dir: Path) -> None:
    frontend_reports_dir.mkdir(parents=True, exist_ok=True)
    import shutil

    dest_path = frontend_reports_dir / Path(json_report_path).name
    shutil.copy(json_report_path, dest_path)
    print(f"フロントエンドにコピー: {dest_path}")
    json_files = sorted(
        frontend_reports_dir.glob("redteam_report_*.json"), reverse=True
    )
    reports = []
    for f in json_files:
        name = f.stem.replace("redteam_report_", "").replace("_", " ")
        reports.append({"name": name, "path": f"/reports/{f.name}"})
    index_path = frontend_reports_dir / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump({"reports": reports}, f, ensure_ascii=False, indent=2)
    print(f"index.json を更新: {len(reports)} 件のレポート")


def print_summary(model_stats: dict[str, ModelStats]) -> None:
    print("\n" + "=" * 60)
    print("評価サマリー")
    print("=" * 60)
    for key, stats in model_stats.items():
        aisi = calculate_aisi_stats(stats)
        print(f"\n{stats.provider}/{stats.model}")
        print("-" * 40)
        effective_total = stats.total_tests - stats.error_count
        print(f"  テスト件数: {stats.total_tests}")
        if stats.error_count > 0:
            print(f"  エラー: {stats.error_count}")
            print(f"  有効テスト: {effective_total}")
        print(f"  自動検知漏洩: {stats.total_leaks}")
        if effective_total > 0:
            print(f"  漏洩率: {stats.total_leaks / effective_total * 100:.1f}%")
        else:
            print("  漏洩率: -")
        print("\n  AISI 3観点:")
        for cat_key in ["privacy", "security", "harmful"]:
            cat_stats = aisi[cat_key]
            print(f"    {cat_stats['name']}: {cat_stats['leak_rate'] * 100:.1f}%")


def main():
    parser = argparse.ArgumentParser(description="レッドチーミング結果を分析")
    parser.add_argument(
        "--dir",
        default="results",
        help="結果ファイルのディレクトリ（デフォルト: results）",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="レポート出力先（デフォルト: results/reports/redteam_report_YYYY-MM-DD.md）",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Markdown レポートを生成しない",
    )
    args = parser.parse_args()
    script_dir = Path(__file__).parent
    base_dir = script_dir.parent
    results_dir = base_dir / args.dir
    print(f"結果ディレクトリ: {results_dir}")
    print("\nCSV ファイルを読み込み中...")
    all_results = load_all_csvs(str(results_dir))
    if not all_results:
        print("結果ファイルが見つかりません")
        return
    print(f"\n合計: {len(all_results)} 件のテスト結果を読み込み")
    model_stats = group_by_model(all_results)
    print_summary(model_stats)
    if not args.no_report:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        reports_dir = results_dir / "reports"
        reports_dir.mkdir(exist_ok=True)
        if args.output:
            output_path = args.output
        else:
            output_path = reports_dir / f"redteam_report_{timestamp}.md"
        generate_report(model_stats, str(output_path))
        json_output_path = reports_dir / f"redteam_report_{timestamp}.json"
        generate_json_report(model_stats, str(json_output_path))
        frontend_reports_dir = base_dir / "frontend" / "public" / "reports"
        update_frontend_index(str(json_output_path), frontend_reports_dir)


if __name__ == "__main__":
    main()
