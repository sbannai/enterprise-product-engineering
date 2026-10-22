#!/usr/bin/env python3
"""Read-only B02 integrity/readiness audit; never grants approval or execution authority."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "eper/uat"
FILES = {
    "gap": BASE / "B02_REQUIREMENT_CASE_GAP_REGISTER.csv",
    "matrix": BASE / "B02_48_ACCEPTANCE_CRITERIA_RESOLUTION_MATRIX.csv",
    "cases": BASE / "B02_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv",
    "checklist": BASE / "B02_48_CASE_APPROVAL_CHECKLIST.csv",
    "capture": BASE / "EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv",
}


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def expected_ids():
    return {f"REQ-{chapter}{seq:02d}" for chapter in range(471, 479) for seq in range(1, 7)}


def audit(records):
    errors, blockers = [], []
    target = expected_ids()
    row_counts = {"gap": 48, "matrix": 48, "cases": 48, "checklist": 48, "capture": 228}
    for name, expected in row_counts.items():
        rows = records[name]
        if len(rows) != expected:
            errors.append(f"{name}: expected {expected} data rows, found {len(rows)}")

    def validate_ids(name, field="requirement_id", expected=target):
        values = [(r.get(field) or "").strip() for r in records[name]]
        if any(not v for v in values) or len(values) != len(set(values)):
            errors.append(f"{name}: blank or duplicate {field}")
        if set(values) != expected:
            errors.append(f"{name}: {field} population does not exactly match expected set")
        return values

    for name in ("gap", "matrix", "cases", "checklist"):
        validate_ids(name)
    capture_ids = [(r.get("requirement_id") or "").strip() for r in records["capture"]]
    expected_all = {f"REQ-{chapter}{seq:02d}" for chapter in range(463, 501) for seq in range(1, 7)}
    if len(capture_ids) != 228 or len(set(capture_ids)) != 228 or set(capture_ids) != expected_all:
        errors.append("capture: requirement IDs must exactly cover the 228-row, 38-chapter baseline")

    capture_by_id = {r.get("requirement_id", "").strip(): r for r in records["capture"]}
    for name in ("gap", "matrix", "cases", "checklist"):
        for row in records[name]:
            req = (row.get("requirement_id") or "").strip()
            if req not in target:
                continue
            master = capture_by_id.get(req)
            if master is None:
                errors.append(f"{name}: {req} missing from master capture")
                continue
            for field in ("chapter", "srs_id"):
                if (row.get(field) or "").strip() != (master.get(field) or "").strip():
                    errors.append(f"{name}: {req} {field} mismatches master capture")

    # This PR is a review scaffold only: fail closed if it accidentally claims approval or execution.
    for name in ("gap", "matrix", "cases", "checklist"):
        for row in records[name]:
            req = (row.get("requirement_id") or "").strip()
            if req not in target:
                continue
            if (row.get("execution_authorized") or "").strip().upper() == "YES":
                errors.append(f"{name}: {req} must not be execution-authorized by scaffold")
            if (row.get("owner_disposition") or "").strip().upper() in {"APPROVED", "ACCEPTED", "PASS"}:
                errors.append(f"{name}: {req} contains an unapproved owner disposition")
            for field in ("owner_name_role", "target_date", "approval_or_change_reference"):
                if field in row and (row.get(field) or "").strip():
                    errors.append(f"{name}: {req} unexpectedly populates {field}")

    for row in records["cases"]:
        req = (row.get("requirement_id") or "").strip()
        if req in target:
            if (row.get("execution_status") or "").strip().upper() != "NOT_RUN":
                errors.append(f"cases: {req} must remain NOT_RUN")
            if (row.get("business_review_status") or "").strip().upper() != "REVIEW_REQUIRED":
                errors.append(f"cases: {req} must remain REVIEW_REQUIRED")
            if (row.get("expected_result_draft") or "").strip().upper().startswith(("PASS", "ACCEPTED")):
                errors.append(f"cases: {req} draft expected result cannot assert approval")

    b02_capture = [r for r in records["capture"] if (r.get("requirement_id") or "").strip() in target]
    for row in b02_capture:
        req = row.get("requirement_id", "")
        if (row.get("outcome") or "").strip().upper() != "NOT_RUN":
            errors.append(f"capture: {req} must remain NOT_RUN until authorized execution")
        if (row.get("business_decision") or "").strip().upper() not in {"", "PENDING"}:
            errors.append(f"capture: {req} business decision must remain pending")
        if any((row.get(f) or "").strip() for f in (
            "tester", "execution_timestamp", "session_authorization_reference",
            "actual_steps", "expected_result", "actual_result", "evidence_archive_reference",
            "business_approver", "approval_date"
        )):
            errors.append(f"capture: {req} has execution/approval fields populated without authorized UAT")

    blockers.extend([
        "Controlled B02 BRD/SRS locator, version and approval reference not verified",
        "Requirement-specific measurable acceptance oracles require owner approval",
        "Exact approved HLD/LLD and DATA/API/EVENT binding/N/A decisions require owner review",
        "Business UAT authorization has not been granted; no test execution is authorized by this scaffold",
    ])
    return {
        "audit": "EPER B02 readiness register integrity",
        "result": "PASS_INTEGRITY_ONLY" if not errors else "FAIL",
        "scope": {"requirements": 48, "chapters": 8, "chapterRange": "471-478"},
        "rowCounts": {name: len(rows) for name, rows in records.items()},
        "integrityErrors": errors,
        "blockers": blockers,
        "businessUatExecuted": False,
        "businessAcceptance": "NOT_EVIDENCED",
        "executionAuthorization": "NO",
        "g9": "NOT_FROZEN",
        "note": "PASS_INTEGRITY_ONLY validates register structure and fail-closed controls; it is not source approval, test execution, UAT evidence, or business acceptance.",
    }


def main():
    records = {name: read_csv(path) for name, path in FILES.items()}
    report = audit(records)
    print(json.dumps(report, indent=2))
    raise SystemExit(1 if report["integrityErrors"] else 0)


if __name__ == "__main__":
    main()
