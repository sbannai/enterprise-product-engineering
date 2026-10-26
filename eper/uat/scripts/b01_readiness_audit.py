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
    expected_b01_ids = {f"REQ-{chapter}{seq:02d}" for chapter in range(463, 471) for seq in range(1, 7)}
    if len(set(req_ids)) != len(req_ids) or any(not item for item in req_ids):
        integrity_errors.append("B01 case checklist contains duplicate or blank requirement IDs")
    if set(req_ids) != expected_b01_ids:
        integrity_errors.append("B01 case checklist requirement IDs do not exactly cover REQ-46301 through REQ-47006")

    unapproved_baselines = [r.get("requirement_id", "") for r in checklist
                            if not (r.get("brd_baseline_approval_status") or "").strip().upper().startswith("APPROVED")
                            and (r.get("brd_baseline_approval_status") or "").strip().upper() not in {"BASELINE_APPROVED"}]
    pending_markers = ("remain pending", "pending", "tbd", "to be defined", "not yet approved")
    incomplete_acceptance_oracles = [
        r.get("requirement_id", "") for r in checklist
        if not (r.get("requirement_specific_acceptance_source") or "").strip()
        or any(marker in (r.get("requirement_specific_acceptance_source") or "").strip().lower()
               for marker in pending_markers)
        or (r.get("measurable_expected_result_approved") or "").strip().upper() not in {"YES", "APPROVED", "PASS"}
    ]
    preparation_fields = (
        "brd_id_status", "brd_locator_status", "approved_brd_version_locator",
        "approved_srs_version_locator", "actor_role_tenant_confirmed",
        "preconditions_and_test_data_approved", "positive_steps_reviewed",
        "negative_path_reviewed", "evidence_capture_plan_approved",
    )
    incomplete_case_preparation = []
    for row in checklist:
        missing = []
        for field in preparation_fields:
            value = (row.get(field) or "").strip()
            if field in {"approved_brd_version_locator", "approved_srs_version_locator"}:
                if not value:
                    missing.append(field)
            else:
                accepted_values = {"YES", "APPROVED", "PASS", "VERIFIED", "COMPLETE"}
                if field == "brd_id_status":
                    accepted_values.add("VERIFIED_ID_AND_SECTION_IN_SOURCE")
                elif field == "brd_locator_status":
                    accepted_values.add("SOURCE_REGISTER_CONFIRMED")
                if value.upper() not in accepted_values:
                    missing.append(field)
        if missing:
            incomplete_case_preparation.append({
                "requirement_id": row.get("requirement_id", ""),
                "missing_fields": missing,
            })
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
               if (r.get("outcome") or "").strip().upper() in
               {"", "NOT_RUN", "NOT RUN", "NOT_EXECUTED", "NOT EXECUTED", "BLOCKED"}]
    accepted = [r.get("requirement_id", "") for r in capture
                if (r.get("outcome") or "").strip().upper() in {"PASS", "ACCEPTED"}
                and (r.get("business_decision") or "").strip().upper() in {"ACCEPT", "ACCEPTED", "APPROVED"}
                and (r.get("business_approver") or "").strip()
                and (r.get("approval_date") or "").strip()
                and (r.get("evidence_archive_reference") or "").strip()]
    capture_ids = [r.get("requirement_id", "").strip() for r in capture]
    if len(set(capture_ids)) != len(capture_ids) or any(not item for item in capture_ids):
        integrity_errors.append("228 requirement execution capture contains duplicate or blank requirement IDs")
    expected_capture_ids = {f"REQ-{chapter}{seq:02d}" for chapter in range(463, 501) for seq in range(1, 7)}
    if set(capture_ids) != expected_capture_ids:
        integrity_errors.append("228 requirement execution capture does not exactly cover REQ-46301 through REQ-50006")

    if unapproved_baselines:
        blockers.append({"gate": "E13/approved baseline", "count": len(unapproved_baselines),
                         "detail": "The controlled BRD/SRS baseline approval status is not verified for these requirements.",
                         "requirement_ids": unapproved_baselines})
    if incomplete_acceptance_oracles:
        blockers.append({"gate": "E13/acceptance oracle", "count": len(incomplete_acceptance_oracles),
                         "detail": "Requirement-specific acceptance-source binding and/or measurable expected result is incomplete.",
                         "requirement_ids": incomplete_acceptance_oracles})
    if incomplete_case_preparation:
        blockers.append({"gate": "E13/case preparation completeness",
                         "count": len(incomplete_case_preparation),
                         "detail": "Approved BRD/SRS locators, actor/tenant scope, test data, positive/negative steps, and evidence-capture planning must be complete for each case.",
                         "cases": incomplete_case_preparation})
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
    if len(accepted) != 228:
        blockers.append({"gate": "requirement-level business acceptance", "count": 228 - len(accepted),
                         "detail": "Each requirement needs an accepted outcome, named business approver, approval date, and evidence archive reference."})

    business_uat_executed = (
        len(capture) == 228
        and set(capture_ids) == expected_capture_ids
        and len(set(capture_ids)) == 228
        and len(accepted) == 228
        and not not_run
        and not integrity_errors
        and not blockers
    )
    return {
        "schemaVersion": 1,
        "report": "eper-b01-business-uat-readiness-audit",
        "mode": "READ_ONLY",
        "readiness": "BLOCKED" if blockers or integrity_errors else "READY_FOR_AUTHORIZED_OWNER_CONFIRMATION",
        "businessUatExecuted": business_uat_executed,
        "counts": {
            "b01Cases": len(checklist),
            "b01Gaps": len(gaps),
            "entryGates": len(gates),
            "requirementsInCaptureRegister": len(capture),
            "casesWithUnapprovedBaseline": len(unapproved_baselines),
            "casesWithIncompleteAcceptanceOracle": len(incomplete_acceptance_oracles),
            "casesWithIncompletePreparation": len(incomplete_case_preparation),
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
