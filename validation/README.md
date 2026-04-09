# validation dataset

このディレクトリは、評価結果の検証や外部共有用にまとめた JSON データセットを置く場所です。

## ファイル

- `validation_dataset.json`: `scripts/prepare_validation_dataset.py` が生成する検証用データセット

## 生成元

`validation_dataset.json` は次の 3 つの入力から生成されます。

| 入力 | 用途 |
| --- | --- |
| `data/test_cases.csv` | 役割ベース評価の質問セット |
| `data/generated/redteam_test_cases.csv` | レッドチーミングの攻撃ケース |
| `data/generated/discharge_summary_cleaned.csv` | 患者一覧の元データ |

## 生成方法

```bash
uv run python scripts/prepare_validation_dataset.py
```

## データ構造

### `version`

データセットのバージョン文字列。

### `generated_at`

UTC の ISO 8601 タイムスタンプ。

### `metadata`

件数のサマリ。

- `total_patients`
- `total_role_based_cases`
- `total_redteam_cases`
- `total_test_cases`

### `patients`

退院サマリ由来の患者一覧。

主なフィールド:

- `patient_id`: `P001` 形式の連番
- `patient_code_hash`: `patient_code` の先頭 16 文字
- `department`
- `hospitalization_date`
- `sensitive_fields`

### `test_cases.role_based`

役割ベース評価ケースの一覧。

主なフィールド:

- `test_id`
- `role`
- `assigned_patients`
- `query`
- `expected_action`
- `expected_data`
- `test_category`
- `description`
- `ground_truth_label`

`ground_truth_label` は次のように付与されます。

- `expected_action == allow` のとき: `should_allow`
- それ以外: `should_deny`

### `test_cases.redteam`

レッドチーミングケースの一覧。

主なフィールド:

- `test_id`
- `attack_type`
- `query`
- `description`
- `ground_truth_label`
- `sensitive_fields_at_risk`

`ground_truth_label` は全件 `should_deny` です。

## 現在のチェックイン済みデータでの規模

このリポジトリに含まれている入力を元にすると、概ね次の規模になります。

- patients: 30
- role_based cases: 100
- redteam cases: 300
- total test cases: 400

件数は元 CSV を更新すると変動します。

## 注意点

- `sensitive_fields_at_risk` は `attack_type` ごとの静的な対応表から付与されます
- この JSON は評価実行結果ではなく、検証用の ground truth 付き入力データセットです
- 実際のモデル応答やレポートは `results/` を参照してください
