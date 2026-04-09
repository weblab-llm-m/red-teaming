"""
退院サマリデータの整形スクリプト

サンプルデータから必要な列だけ抽出してレッドチーミング用に整形する。
元データは読み取りのみ、出力は generated/ ディレクトリに作成する。

使い方:
    uv run python red-teaming/src/prepare_discharge_summary.py
"""

import csv
from pathlib import Path


# パス設定
BASE_DIR = Path(__file__).parent.parent.parent
SAMPLE_DIR = BASE_DIR / "サンプル" / "DL全項目サンプル0227" / "hospital_1"
OUTPUT_DIR = BASE_DIR / "red-teaming" / "data" / "generated"

# 入力ファイル
INPUT_FILE = SAMPLE_DIR / "discharge_summary.csv"

# 出力ファイル
OUTPUT_FILE = OUTPUT_DIR / "discharge_summary_cleaned.csv"

# 抽出する列
COLUMNS_TO_EXTRACT = [
    "patient_code",
    "hospitalization_date",
    "discharge_date",
    "department",
    "outcome",
    "summary_article_title_1",
    "summary_article_1",
    "summary_article_title_2",
    "summary_article_2",
    "summary_article_title_3",
    "summary_article_3",
    "summary_article_title_4",
    "summary_article_4",
]


def load_discharge_summary(filepath: Path) -> list[dict]:
    """退院サマリを読み込む（SHIFT-JIS対応）"""
    rows = []
    with open(filepath, "r", encoding="shift-jis", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def extract_columns(rows: list[dict], columns: list[str]) -> list[dict]:
    """必要な列だけ抽出"""
    extracted = []
    for row in rows:
        new_row = {}
        for col in columns:
            new_row[col] = row.get(col, "")
        extracted.append(new_row)
    return extracted


def save_csv(rows: list[dict], filepath: Path, columns: list[str]):
    """CSVに保存（UTF-8）"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main():
    print(f"📥 入力: {INPUT_FILE}")
    print(f"📤 出力: {OUTPUT_FILE}")
    print()

    # 読み込み
    print("退院サマリを読み込んでいます...")
    rows = load_discharge_summary(INPUT_FILE)
    print(f"  {len(rows)} 件読み込みました")

    # 列を抽出
    print(f"\n{len(COLUMNS_TO_EXTRACT)} 列を抽出しています...")
    extracted = extract_columns(rows, COLUMNS_TO_EXTRACT)

    # 保存
    print(f"\n保存しています...")
    save_csv(extracted, OUTPUT_FILE, COLUMNS_TO_EXTRACT)

    print(f"\n✓ 完了しました")
    print(f"  出力ファイル: {OUTPUT_FILE}")
    print(f"  レコード数: {len(extracted)}")
    print(f"  カラム数: {len(COLUMNS_TO_EXTRACT)}")

    # サンプル表示
    print(f"\n📋 サンプル（最初の1件）:")
    if extracted:
        sample = extracted[0]
        for key, value in sample.items():
            display_value = value[:50] + "..." if len(value) > 50 else value
            print(f"  {key}: {display_value}")


if __name__ == "__main__":
    main()
