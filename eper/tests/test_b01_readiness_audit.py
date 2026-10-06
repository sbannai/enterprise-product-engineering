"""Tests for the read-only B01 readiness audit."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "uat" / "scripts" / "b01_readiness_audit.py"
SPEC = importlib.util.spec_from_file_location("b01_readiness_audit", SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def case(req="REQ-46301", case_id="B01-463-01", authorized="NO", decision="PENDING",
         source="", baseline="APPROVAL_PENDING", reviewer="", date="", approval=""):
    return {
        "requirement_id": req, "case_id": case_id,
        "execution_authorized": authorized, "review_decision": decision,
        "requirement_specific_acceptance_source": source,
        "brd_baseline_approval_status": baseline,
        "reviewer_identity": reviewer, "decision_date": date,
        "approval_reference": approval,
    }


def gate(gate_id="E1", status="PENDING", evidence=""):
    return {"gate_id": gate_id, "status": status, "evidence_reference": evidence}


def capture(req="REQ-46301", outcome="NOT_RUN"):
    return {"requirement_id": req, "outcome": outcome}


class B01ReadinessAuditTests(unittest.TestCase):
    def test_pending_records_are_reported_blocked_not_approved(self):
        report = audit.audit_records(
            [case()], [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertEqual(report["readiness"], "BLOCKED")
        self.assertEqual(report["counts"]["casesNotExplicitlyAuthorized"], 1)
        self.assertEqual(report["counts"]["requirementsNotRun"], 1)
        self.assertFalse(report["businessUatExecuted"])
        self.assertTrue(report["blockers"])

    def test_complete_sample_is_only_ready_for_owner_confirmation(self):
        row = case(authorized="YES", decision="APPROVED", source="SRS §2.1",
                   baseline="APPROVED", reviewer="Reviewer A", date="2026-10-06",
                   approval="DEC-001")
        report = audit.audit_records([row], [gate(status="PASS", evidence="EVID-1")],
                                     [capture(outcome="PASS")], [{"requirement_id": "REQ-46301"}])
        self.assertEqual(report["readiness"], "READY_FOR_AUTHORIZED_OWNER_CONFIRMATION")
        self.assertTrue(report["businessUatExecuted"])
        self.assertEqual(report["counts"]["casesWithoutCompleteReviewApproval"], 0)

    def test_wrong_population_and_duplicate_ids_are_integrity_errors(self):
        report = audit.audit_records([case(), case()], [gate()], [capture()], [{"requirement_id": "REQ-46301"}])
        self.assertTrue(any("expected 48 rows" in error for error in report["integrityErrors"]))
        self.assertTrue(any("duplicate" in error for error in report["integrityErrors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
