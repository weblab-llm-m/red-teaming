"""
ダミー電話番号生成スクリプト

総務省データに基づく「未使用の携帯電話番号プリフィックス」を使用して、
実在しない電話番号を生成します。

参考: https://github.com/thr3a/phone_number_generator
データソース: https://raw.githubusercontent.com/thr3a/phone_number_generator/master/src/data.json
"""

import csv
import json
import random
from pathlib import Path

# データディレクトリのパス
DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR = DATA_DIR / "generated"  # 生成データは別ディレクトリに出力

# 総務省データに基づく未使用の070番号プリフィックス
# これらは事業者に割り当てられていないため、実在しない
PREFIXES_JSON = DATA_DIR / "unused_phone_prefixes.json"


def load_unused_prefixes() -> list[str]:
    """
    JSONファイルから未使用プリフィックスを読み込む

    Returns:
        未使用プリフィックスのリスト
    """
    with open(PREFIXES_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


UNUSED_PREFIXES = load_unused_prefixes()


def generate_phone_number() -> str:
    """
    未使用プリフィックス + 5桁乱数で電話番号を生成

    Returns:
        070-XXXX-XXXX 形式の電話番号
    """
    prefix = random.choice(UNUSED_PREFIXES)
    suffix = random.randint(10000, 99999)

    # 070-XXXX-XXXX 形式にフォーマット
    # prefix "070251" + suffix 91234 → "070-2519-1234"
    middle = prefix[3:] + str(suffix)[0]  # "251" + "9" = "2519"
    last = str(suffix)[1:]  # "1234"

    return f"070-{middle}-{last}"


def generate_unique_phone_numbers(count: int) -> list[str]:
    """
    重複のない電話番号リストを生成

    Args:
        count: 生成する電話番号の数

    Returns:
        電話番号のリスト
    """
    numbers = set()
    while len(numbers) < count:
        numbers.add(generate_phone_number())
    return list(numbers)


def update_patient_csv(csv_path: Path, output_path: Path | None = None):
    """
    患者CSVファイルの電話番号を更新
    VIP患者（sensitive_flag=1）は「非公開」のまま維持

    Args:
        csv_path: 入力CSVファイルのパス
        output_path: 出力CSVファイルのパス（Noneの場合は上書き）
    """
    if output_path is None:
        output_path = csv_path

    # CSVを読み込み
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    # 非VIP患者の数をカウント
    non_vip_count = sum(1 for row in rows if row.get("sensitive_flag") != "1")

    # 電話番号を生成
    phone_numbers = generate_unique_phone_numbers(non_vip_count)
    phone_idx = 0

    # 電話番号を更新
    for row in rows:
        if row.get("sensitive_flag") == "1":
            row["phone"] = "非公開"
        else:
            row["phone"] = phone_numbers[phone_idx]
            phone_idx += 1

    # CSVを書き出し
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✓ {len(rows)} 件の患者データを更新しました")
    print(f"  - VIP患者: {len(rows) - non_vip_count} 件（非公開）")
    print(f"  - 一般患者: {non_vip_count} 件（新規電話番号）")
    print(f"  → {output_path}")


if __name__ == "__main__":
    # 入力: 元データ（read only）
    input_csv = DATA_DIR / "patients_from_sample.csv"

    # 出力: 生成ディレクトリに新規作成
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_csv = OUTPUT_DIR / "patients_with_dummy_phone.csv"

    print(f"📂 プリフィックス数: {len(UNUSED_PREFIXES)} 個")
    print(f"📄 データソース: {PREFIXES_JSON}")
    print(f"📥 入力（read only）: {input_csv}")
    print(f"📤 出力: {output_csv}")
    print()

    # 電話番号を更新して別ファイルに出力
    update_patient_csv(input_csv, output_csv)
