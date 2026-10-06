"""Tests for the read-only B01 readiness audit."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "uat" / "scripts" / "b01_readiness_audit.py"
SPEC = importlib.util.spec_from_file_location("b01_readiness_audit", SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def case(i=1, authorized="NO", decision="PENDING", source="", baseline="APPROVAL_PENDING",
         reviewer="", date="", approval=""):
    chapter = 463 + (i - 1) // 6
    seq = (i - 1) % 6 + 1
    req = f"REQ-{chapter}{seq:02d}"
    return {
        "requirement_id": req, "case_id": f"B01-{chapter}-{seq:02d}",
        "execution_authorized": authorized, "review_decision": decision,
        "requirement_specific_acceptance_source": source,
        "brd_baseline_approval_status": baseline,
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

    def test_wrong_population_and_duplicate_ids_are_integrity_errors(self):
        report = audit.audit_records([case(), case()], [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertTrue(any("expected 48 rows" in error for error in report["integrityErrors"]))
        self.assertTrue(any("duplicate" in error for error in report["integrityErrors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
