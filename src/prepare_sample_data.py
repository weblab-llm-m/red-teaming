"""
サンプルデータから red-teaming 用の patients.csv を生成するスクリプト

使い方:
    uv run src/prepare_sample_data.py
"""

import csv
import random
from pathlib import Path
from datetime import datetime
from typing import Dict, List


def calculate_age(birth_date_str: str) -> int:
    """生年月日から年齢を計算 (2025年基準)"""
    try:
        # "1963/10" 形式を想定
        parts = birth_date_str.split('/')
        if len(parts) == 2:
            birth_year = int(parts[0])
            return 2025 - birth_year
        return 0
    except:
        return 0


def generate_fake_name(gender: str, index: int) -> str:
    """擬似的な患者名を生成"""
    surnames = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤"]
    male_names = ["太郎", "一郎", "健太", "大輔", "隆", "誠", "修", "勇", "武", "昭"]
    female_names = ["花子", "美咲", "由美", "恵子", "和子", "洋子", "千代", "春子", "陽子", "愛"]

    surname = surnames[index % len(surnames)]
    if gender == "男性":
        given_name = male_names[index % len(male_names)]
    else:
        given_name = female_names[index % len(female_names)]

    return f"{surname}{given_name}"


def generate_fake_phone(index: int) -> str:
    """擬似的な電話番号を生成"""
    return f"03-{1000 + index:04d}-{5678 + index:04d}"


def generate_fake_address(index: int) -> str:
    """擬似的な住所を生成"""
    cities = ["渋谷区", "新宿区", "港区", "世田谷区", "目黒区", "品川区", "大田区", "中野区", "杉並区", "練馬区"]
    areas = ["1-2-3", "2-3-4", "3-4-5", "4-5-6", "5-6-7"]

    city = cities[index % len(cities)]
    area = areas[index % len(areas)]

    return f"東京都{city}○○町{area}"


def generate_fake_doctor(department: str, index: int) -> str:
    """擬似的な担当医名を生成"""
    doctors = ["山田医師", "鈴木医師", "佐藤医師", "田中医師", "高橋医師", "伊藤医師", "渡辺医師", "中村医師"]
    return doctors[index % len(doctors)]


def load_sample_data(sample_dir: Path) -> List[Dict]:
    """サンプルデータから患者情報を読み込み"""

    # 患者基本情報を辞書化
    patient_info_path = sample_dir / "patient_information.csv"
    patient_info_dict = {}

    with open(patient_info_path, 'r', encoding='shift-jis', errors='ignore') as f:
        reader = csv.DictReader(f)
        for row in reader:
            patient_info_dict[row['patient_code']] = {
                'gender': row['gender'],
                'birth_date': row['birth_date'],
                'department': row['final_visit_clinic'],
            }

    # 病名情報から患者リストを作成
    disease_path = sample_dir / "disease.csv"
    patients = []
    processed_patients = set()

    with open(disease_path, 'r', encoding='shift-jis', errors='ignore') as f:
        reader = csv.DictReader(f)
        for row in reader:
            patient_code = row['patient_code']

            # 既に処理済みの患者はスキップ
            if patient_code in processed_patients:
                continue

            # 病名を取得 (主病名を優先)
            if row.get('main_disease_suspicion_category') == '主病名':
                diagnosis = row.get('main_disease_name', row.get('disease_name', '不明'))
            else:
                diagnosis = row.get('disease_name', '不明')

            # patient_information から情報を取得、なければデフォルト値
            if patient_code in patient_info_dict:
                info = patient_info_dict[patient_code]
            else:
                # disease.csv のみに存在する患者の場合
                info = {
                    'gender': '不明',
                    'birth_date': '1950/1',  # デフォルト
                    'department': '内科',  # デフォルト
                }

            patients.append({
                'patient_code': patient_code,
                'gender': info['gender'],
                'birth_date': info['birth_date'],
                'department': info['department'],
                'diagnosis': diagnosis,
            })

            processed_patients.add(patient_code)

    return patients


def create_patients_csv(sample_dir: Path, output_path: Path, limit: int = 30):
    """サンプルデータから patients.csv を生成"""

    print(f"サンプルデータを読み込み中: {sample_dir}")
    patients = load_sample_data(sample_dir)

    print(f"患者数: {len(patients)}")

    # VIP患者をランダムに選択 (2-3人)
    vip_indices = random.sample(range(len(patients)), k=min(3, len(patients)))

    # 出力データを準備
    output_data = []
    for i, patient in enumerate(patients[:limit]):
        age = calculate_age(patient['birth_date'])
        name = generate_fake_name(patient['gender'], i)
        phone = generate_fake_phone(i)
        address = generate_fake_address(i)
        doctor = generate_fake_doctor(patient['department'], i)
        sensitive_flag = 1 if i in vip_indices else 0

        # VIP患者は個人情報を非公開に
        if sensitive_flag == 1:
            name = f"VIP患者{i+1}"
            phone = "非公開"
            address = "非公開"

        output_data.append({
            'patient_id': patient['patient_code'][:8],  # 短縮ID
            'name': name,
            'age': age,
            'gender': patient['gender'],
            'diagnosis': patient['diagnosis'],
            'department': patient['department'],
            'primary_doctor': doctor,
            'admission_date': '',  # サンプルデータには入院日がない場合が多い
            'sensitive_flag': sensitive_flag,
            'phone': phone,
            'address': address,
        })

    # CSV出力
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['patient_id', 'name', 'age', 'gender', 'diagnosis', 'department',
                      'primary_doctor', 'admission_date', 'sensitive_flag', 'phone', 'address']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_data)

    print(f"\n患者データを生成しました: {output_path}")
    print(f"  総患者数: {len(output_data)}")
    print(f"  VIP患者数: {sum(1 for p in output_data if p['sensitive_flag'] == 1)}")
    print(f"\nサンプル (最初の3人):")
    for p in output_data[:3]:
        print(f"  {p['patient_id']}: {p['name']}, {p['age']}歳, {p['gender']}, {p['diagnosis']}, {p['department']}")


def main():
    """メイン処理"""
    # パス設定
    base_dir = Path(__file__).parent.parent.parent
    sample_dir = base_dir / "サンプル" / "DL全項目サンプル0227" / "hospital_1"
    output_path = base_dir / "red-teaming" / "data" / "patients_from_sample.csv"

    # データ生成
    random.seed(42)  # 再現性のため
    create_patients_csv(sample_dir, output_path, limit=30)

    print(f"\n完了しました。")
    print(f"次のステップ:")
    print(f"  1. {output_path} を確認")
    print(f"  2. 必要に応じて data/patients.csv と置き換え")
    print(f"  3. test_cases.csv を更新")


if __name__ == "__main__":
    main()
