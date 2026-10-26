"""Tests for the read-only B01 readiness audit."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "b01_readiness_audit.py"
SPEC = importlib.util.spec_from_file_location("b01_readiness_audit", SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def case(i=1, authorized="NO", decision="PENDING", source="", baseline="APPROVAL_PENDING",
         reviewer="", date="", approval="", expected="YES"):
    chapter = 463 + (i - 1) // 6
    seq = (i - 1) % 6 + 1
    req = f"REQ-{chapter}{seq:02d}"
    return {
        "requirement_id": req, "case_id": f"B01-{chapter}-{seq:02d}",
        "execution_authorized": authorized, "review_decision": decision,
        "requirement_specific_acceptance_source": source,
        "brd_baseline_approval_status": baseline,
        "measurable_expected_result_approved": expected,
        "brd_id_status": "VERIFIED_ID_AND_SECTION_IN_SOURCE", "brd_locator_status": "SOURCE_REGISTER_CONFIRMED",
        "approved_brd_version_locator": "BRD-v1 §1",
        "approved_srs_version_locator": "SRS-v1 §1",
        "actor_role_tenant_confirmed": "YES",
        "preconditions_and_test_data_approved": "YES",
        "positive_steps_reviewed": "YES", "negative_path_reviewed": "YES",
        "evidence_capture_plan_approved": "YES",
        "reviewer_identity": reviewer, "decision_date": date,
        "approval_reference": approval,
    }


def gate(i=1, status="PENDING", evidence=""):
    return {"gate_id": f"E{i}", "status": status, "evidence_reference": evidence}


def capture(i=1, outcome="NOT_RUN", accepted=False):
    chapter = 463 + (i - 1) // 6
    seq = (i - 1) % 6 + 1
    row = {"requirement_id": f"REQ-{chapter}{seq:02d}", "outcome": outcome}
    if accepted:
        row.update({"business_decision": "ACCEPTED", "business_approver": "Business Owner",
                    "approval_date": "2026-10-06", "evidence_archive_reference": f"EVID-{i:03d}"})
    return row


class B01ReadinessAuditTests(unittest.TestCase):
    def test_checked_in_registers_report_current_blocked_baseline(self):
        checklist = audit.read_csv(audit.CHECKLIST)
        gates = audit.read_csv(audit.GATES)
        capture_rows = audit.read_csv(audit.CAPTURE)
        gaps = audit.read_csv(audit.GAP_REGISTER)
        report = audit.audit_records(checklist, gates, capture_rows, gaps)
        self.assertEqual(report["counts"]["b01Cases"], 48)
        self.assertEqual(report["counts"]["b01Gaps"], 48)
        self.assertEqual(report["counts"]["entryGates"], 13)
        self.assertEqual(report["counts"]["requirementsInCaptureRegister"], 228)
        self.assertEqual(report["readiness"], "BLOCKED")
        self.assertFalse(report["businessUatExecuted"])
        self.assertEqual(report["integrityErrors"], [])

    def test_approved_baseline_is_not_misreported_as_missing(self):
        cases = [case(i, source=f"BRD §{i}; SRS §{i}; EM-LLD-001 §{i}",
                      baseline="APPROVED_B01-BASELINE-APPROVAL-001", expected="YES")
                 for i in range(1, 49)]
        report = audit.audit_records(
            cases, [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertEqual(report["counts"]["casesWithUnapprovedBaseline"], 0)
        self.assertNotIn("E13/approved baseline", {b["gate"] for b in report["blockers"]})

    def test_acceptance_oracle_gap_is_reported_separately_from_baseline(self):
        cases = [case(i, source=f"BRD §{i}; SRS §{i}; EM-LLD-001 §{i}",
                      baseline="APPROVED_B01-BASELINE-APPROVAL-001", expected="YES")
                 for i in range(1, 49)]
        cases[0]["requirement_specific_acceptance_source"] = (
            "Controlled BRD/SRS baseline approved; requirement-level binding remains pending")
        cases[0]["measurable_expected_result_approved"] = "PENDING"
        report = audit.audit_records(
            cases, [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        blockers = {b["gate"]: b for b in report["blockers"]}
        self.assertEqual(report["counts"]["casesWithUnapprovedBaseline"], 0)
        self.assertEqual(report["counts"]["casesWithIncompleteAcceptanceOracle"], 1)
        self.assertNotIn("E13/approved baseline", blockers)
        self.assertEqual(blockers["E13/acceptance oracle"]["count"], 1)

    def test_unapproved_baseline_is_reported_independently(self):
        cases = [case(i, source=f"BRD §{i}; SRS §{i}; EM-LLD-001 §{i}",
                      baseline="APPROVED_B01-BASELINE-APPROVAL-001", expected="YES")
                 for i in range(1, 49)]
        cases[0]["brd_baseline_approval_status"] = "PENDING"
        report = audit.audit_records(
            cases, [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        blockers = {b["gate"]: b for b in report["blockers"]}
        self.assertEqual(report["counts"]["casesWithUnapprovedBaseline"], 1)
        self.assertIn("E13/approved baseline", blockers)
        self.assertEqual(blockers["E13/approved baseline"]["count"], 1)

    def test_case_preparation_gaps_are_reported_explicitly(self):
        cases = [case(i, source=f"BRD §{i}; SRS §{i}; EM-LLD-001 §{i}",
                      baseline="APPROVED_B01-BASELINE-APPROVAL-001", expected="YES")
                 for i in range(1, 49)]
        cases[0]["negative_path_reviewed"] = "PENDING"
        cases[0]["approved_srs_version_locator"] = ""
        report = audit.audit_records(
            cases, [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        blockers = {b["gate"]: b for b in report["blockers"]}
        self.assertEqual(report["counts"]["casesWithIncompletePreparation"], 1)
        self.assertEqual(blockers["E13/case preparation completeness"]["count"], 1)
        self.assertEqual(
            blockers["E13/case preparation completeness"]["cases"][0]["missing_fields"],
            ["approved_srs_version_locator", "negative_path_reviewed"])

    def test_pending_records_are_reported_blocked_not_approved(self):
        report = audit.audit_records(
            [case()], [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertEqual(report["readiness"], "BLOCKED")
        self.assertEqual(report["counts"]["casesNotExplicitlyAuthorized"], 1)
        self.assertEqual(report["counts"]["requirementsNotRun"], 1)
        self.assertFalse(report["businessUatExecuted"])
        self.assertTrue(report["blockers"])

    def test_complete_population_is_only_ready_for_owner_confirmation(self):
        cases = [case(i, authorized="YES", decision="APPROVED", source=f"SRS locator {i}",
                      baseline="APPROVED", reviewer="Reviewer A", date="2026-10-06",
                      approval=f"DEC-{i:03d}") for i in range(1, 49)]
        gates = [gate(i, status="PASS", evidence=f"EVID-{i}") for i in range(1, 14)]
        captures = [capture(i, outcome="PASS", accepted=True) for i in range(1, 229)]
        gaps = [{"requirement_id": f"REQ-{463 + (i-1)//6}{(i-1)%6+1:02d}"} for i in range(1,49)]
        report = audit.audit_records(cases, gates, captures, gaps)
        self.assertEqual(report["readiness"], "READY_FOR_AUTHORIZED_OWNER_CONFIRMATION")
        self.assertTrue(report["businessUatExecuted"])
        self.assertEqual(report["counts"]["casesWithoutCompleteReviewApproval"], 0)
        self.assertEqual(report["integrityErrors"], [])

    def test_blocked_outcome_and_wrong_requirement_mapping_cannot_count_as_executed(self):
        cases = [case(i, authorized="YES", decision="APPROVED", source=f"SRS locator {i}",
                      baseline="APPROVED", reviewer="Reviewer A", date="2026-10-06",
                      approval=f"DEC-{i:03d}") for i in range(1, 49)]
        gates = [gate(i, status="PASS", evidence=f"EVID-{i}") for i in range(1, 14)]
        captures = [capture(i, outcome="PASS", accepted=True) for i in range(1, 229)]
        captures[-1]["requirement_id"] = captures[0]["requirement_id"]
        captures[-1]["outcome"] = "BLOCKED"
        report = audit.audit_records(cases, gates, captures,
                                     [{"requirement_id": f"REQ-{463 + (i-1)//6}{(i-1)%6+1:02d}"} for i in range(1, 49)])
        self.assertFalse(report["businessUatExecuted"])
        self.assertTrue(any("duplicate" in error for error in report["integrityErrors"]))
        self.assertTrue(any("exactly cover" in error for error in report["integrityErrors"]))
        self.assertEqual(report["counts"]["requirementsNotRun"], 1)

    def test_all_acceptance_rows_cannot_override_pending_entry_gate(self):
        cases = [case(i, authorized="YES", decision="APPROVED", source=f"SRS locator {i}",
                      baseline="APPROVED", reviewer="Reviewer A", date="2026-10-06",
                      approval=f"DEC-{i:03d}") for i in range(1, 49)]
        gates = [gate(i, status="PASS", evidence=f"EVID-{i}") for i in range(1, 14)]
        gates[-1] = gate(13, status="PENDING", evidence="")
        captures = [capture(i, outcome="PASS", accepted=True) for i in range(1, 229)]
        gaps = [{"requirement_id": f"REQ-{463 + (i-1)//6}{(i-1)%6+1:02d}"} for i in range(1, 49)]
        report = audit.audit_records(cases, gates, captures, gaps)
        self.assertEqual(report["readiness"], "BLOCKED")
        self.assertFalse(report["businessUatExecuted"])
        self.assertEqual(report["counts"]["entryGatesPendingOrWithoutEvidence"], 1)

    def test_wrong_population_and_duplicate_ids_are_integrity_errors(self):
        report = audit.audit_records([case(), case()], [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertTrue(any("expected 48 rows" in error for error in report["integrityErrors"]))
        self.assertTrue(any("duplicate" in error for error in report["integrityErrors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
