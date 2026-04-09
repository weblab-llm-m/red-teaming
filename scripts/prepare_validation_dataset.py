#!/usr/bin/env python3

import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
GENERATED_DIR = DATA_DIR / "generated"
VALIDATION_DIR = BASE_DIR / "validation"

TEST_CASES_PATH = DATA_DIR / "test_cases.csv"
REDTEAM_PATH = GENERATED_DIR / "redteam_test_cases.csv"
DISCHARGE_PATH = GENERATED_DIR / "discharge_summary_cleaned.csv"
OUTPUT_PATH = VALIDATION_DIR / "validation_dataset.json"


def load_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def get_sensitive_fields() -> list[str]:
    return [
        "patient_code",
        "hospitalization_date",
        "discharge_date",
        "summary_article_1",
        "summary_article_2",
        "summary_article_3",
        "summary_article_4",
    ]


def build_patients(discharge_records: list[dict]) -> list[dict]:
    patients = []
    sensitive_fields = get_sensitive_fields()

    for idx, record in enumerate(discharge_records, start=1):
        patient_id = f"P{idx:03d}"
        patient_code = record.get("patient_code", "")
        patient_code_hash = patient_code[:16] if len(patient_code) >= 16 else patient_code

        patients.append({
            "patient_id": patient_id,
            "patient_code_hash": patient_code_hash,
            "department": record.get("department", ""),
            "hospitalization_date": record.get("hospitalization_date", ""),
            "sensitive_fields": sensitive_fields,
        })

    return patients


def derive_ground_truth_label(expected_action: str) -> str:
    if expected_action.lower() == "allow":
        return "should_allow"
    return "should_deny"


def build_role_based_cases(test_cases: list[dict]) -> list[dict]:
    cases = []
    for record in test_cases:
        expected_action = record.get("expected_action", "deny")
        cases.append({
            "test_id": record.get("test_id", ""),
            "role": record.get("role", ""),
            "assigned_patients": record.get("assigned_patients", ""),
            "query": record.get("query", ""),
            "expected_action": expected_action,
            "expected_data": record.get("expected_data", ""),
            "test_category": record.get("test_category", ""),
            "description": record.get("description", ""),
            "ground_truth_label": derive_ground_truth_label(expected_action),
        })
    return cases


def get_sensitive_fields_at_risk(attack_type: str) -> list[str]:
    base_fields = ["patient_code", "diagnosis", "treatment"]

    if attack_type in ("direct", "impersonation", "roleplay"):
        return base_fields + ["hospitalization_date", "discharge_date", "summary_article_1"]
    elif attack_type in ("indirect", "stepwise"):
        return base_fields
    elif attack_type == "injection":
        return ["patient_code", "diagnosis", "treatment", "personal_info"]
    elif attack_type == "harmful_medical":
        return ["treatment", "medication", "dosage"]
    else:
        return base_fields


def build_redteam_cases(redteam_records: list[dict]) -> list[dict]:
    cases = []
    for record in redteam_records:
        attack_type = record.get("attack_type", "")
        cases.append({
            "test_id": record.get("test_id", ""),
            "attack_type": attack_type,
            "query": record.get("query", ""),
            "description": record.get("description", ""),
            "ground_truth_label": "should_deny",
            "sensitive_fields_at_risk": get_sensitive_fields_at_risk(attack_type),
        })
    return cases


def main():
    test_cases = load_csv(TEST_CASES_PATH)
    redteam_records = load_csv(REDTEAM_PATH)
    discharge_records = load_csv(DISCHARGE_PATH)

    patients = build_patients(discharge_records)
    role_based_cases = build_role_based_cases(test_cases)
    redteam_cases = build_redteam_cases(redteam_records)

    validation_dataset = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "total_patients": len(patients),
            "total_role_based_cases": len(role_based_cases),
            "total_redteam_cases": len(redteam_cases),
            "total_test_cases": len(role_based_cases) + len(redteam_cases),
        },
        "patients": patients,
        "test_cases": {
            "role_based": role_based_cases,
            "redteam": redteam_cases,
        },
    }

    VALIDATION_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(validation_dataset, f, ensure_ascii=False, indent=2)

    print(f"Validation dataset generated: {OUTPUT_PATH}")
    print(f"  Patients: {len(patients)}")
    print(f"  Role-based cases: {len(role_based_cases)}")
    print(f"  Red-team cases: {len(redteam_cases)}")
    print(f"  Total test cases: {len(role_based_cases) + len(redteam_cases)}")


if __name__ == "__main__":
    main()
