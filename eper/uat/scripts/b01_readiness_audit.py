#!/usr/bin/env python3
"""Read-only B01 business-UAT readiness audit. Never changes execution/approval records."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHECKLIST = ROOT / "eper/uat/B01_48_CASE_APPROVAL_CHECKLIST.csv"
GATES = ROOT / "eper/uat/B01_E1_E13_GATE_VERIFICATION_CHECKLIST.csv"
CAPTURE = ROOT / "eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv"
GAP_REGISTER = ROOT / "eper/uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv"


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def count_values(rows, field):
    result = {}
    for row in rows:
        value = (row.get(field) or "").strip() or "(blank)"
        result[value] = result.get(value, 0) + 1
    return result


def audit_records(checklist, gates, capture, gaps):
    blockers = []
    expected = {"B01 case checklist": (checklist, 48),
                "B01 gap register": (gaps, 48),
                "E1-E13 gate checklist": (gates, 13),
                "228 requirement execution capture": (capture, 228)}
    integrity_errors = []
    for label, (rows, count) in expected.items():
        if len(rows) != count:
            integrity_errors.append(f"{label}: expected {count} rows, found {len(rows)}")

    case_ids = [r.get("case_id", "").strip() for r in checklist]
    req_ids = [r.get("requirement_id", "").strip() for r in checklist]
    if len(set(case_ids)) != len(case_ids):
        integrity_errors.append("B01 case checklist contains duplicate or blank case IDs")
    if len(set(req_ids)) != len(req_ids):
        integrity_errors.append("B01 case checklist contains duplicate or blank requirement IDs")

    missing_sources = [r.get("requirement_id", "") for r in checklist
                       if not (r.get("requirement_specific_acceptance_source") or "").strip()
                       or (r.get("brd_baseline_approval_status") or "").strip() not in {"APPROVED", "BASELINE_APPROVED"}]
    unapproved_cases = [r.get("requirement_id", "") for r in checklist
                        if (r.get("review_decision") or "").strip().upper() not in {"APPROVE", "APPROVED", "APPROVE_WITH_CHANGES"}
                        or not (r.get("reviewer_identity") or "").strip()
                        or not (r.get("decision_date") or "").strip()
                        or not (r.get("approval_reference") or "").strip()]
    unauthorized_cases = [r.get("requirement_id", "") for r in checklist
                          if (r.get("execution_authorized") or "").strip().upper() != "YES"]
    pending_gates = [r.get("gate_id", "") for r in gates
                     if (r.get("status") or "").strip().upper() not in {"PASS", "VERIFIED", "COMPLETE"}
                     or not (r.get("evidence_reference") or "").strip()]
    not_run = [r.get("requirement_id", "") for r in capture
               if (r.get("outcome") or "").strip().upper() in {"", "NOT_RUN", "NOT RUN"}]
    accepted = [r.get("requirement_id", "") for r in capture
                if (r.get("outcome") or "").strip().upper() in {"PASS", "ACCEPTED"}
                and (r.get("business_decision") or "").strip().upper() in {"ACCEPT", "ACCEPTED", "APPROVED"}
                and (r.get("business_approver") or "").strip()
                and (r.get("approval_date") or "").strip()
                and (r.get("evidence_archive_reference") or "").strip()]
    capture_ids = [r.get("requirement_id", "").strip() for r in capture]
    if len(set(capture_ids)) != len(capture_ids):
        integrity_errors.append("228 requirement execution capture contains duplicate or blank requirement IDs")

    if missing_sources:
        blockers.append({"gate": "E13/source baseline", "count": len(missing_sources),
                         "detail": "Requirement-specific approved acceptance source or approved BRD baseline is missing.",
                         "requirement_ids": missing_sources})
    if unapproved_cases:
        blockers.append({"gate": "D3/case review", "count": len(unapproved_cases),
                         "detail": "Case reviewer decision, identity, date, or approval reference is incomplete.",
                         "requirement_ids": unapproved_cases})
    if unauthorized_cases:
        blockers.append({"gate": "D4/execution authorization", "count": len(unauthorized_cases),
                         "detail": "Execution authorization is not explicitly YES.",
                         "requirement_ids": unauthorized_cases})
    if pending_gates:
        blockers.append({"gate": "E1-E13 evidence", "count": len(pending_gates),
                         "detail": "Gate status is not verified/complete or its evidence reference is missing.",
                         "gate_ids": pending_gates})
    return {
        "schemaVersion": 1,
        "report": "eper-b01-business-uat-readiness-audit",
        "mode": "READ_ONLY",
        "readiness": "BLOCKED" if blockers or integrity_errors else "READY_FOR_AUTHORIZED_OWNER_CONFIRMATION",
        "businessUatExecuted": len(capture) == 228 and len(accepted) == 228 and not not_run,
        "counts": {
            "b01Cases": len(checklist),
            "b01Gaps": len(gaps),
            "entryGates": len(gates),
            "requirementsInCaptureRegister": len(capture),
            "casesWithMissingApprovedSource": len(missing_sources),
            "casesWithoutCompleteReviewApproval": len(unapproved_cases),
            "casesNotExplicitlyAuthorized": len(unauthorized_cases),
            "entryGatesPendingOrWithoutEvidence": len(pending_gates),
            "requirementsNotRun": len(not_run),
            "requirementsWithCompleteBusinessAcceptance": len(accepted),
        },
        "integrityErrors": integrity_errors,
        "blockers": blockers,
        "control": "This report checks register completeness only. It does not execute tests, approve cases, authorize UAT, or constitute business acceptance."
    }


def main():
    report = audit_records(read_csv(CHECKLIST), read_csv(GATES),
                           read_csv(CAPTURE), read_csv(GAP_REGISTER))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 2 if report["integrityErrors"] else 0


if __name__ == "__main__":
    sys.exit(main())
