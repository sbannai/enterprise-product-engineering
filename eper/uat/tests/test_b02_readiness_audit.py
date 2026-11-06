"""Unit tests for the read-only B02 readiness audit."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "b02_readiness_audit.py"
SPEC = importlib.util.spec_from_file_location("b02_readiness_audit", SCRIPT)
audit_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_module)


def rows_for(name):
    ids = sorted(audit_module.expected_ids())
    rows = []
    for i, req in enumerate(ids, 1):
        chapter = int(req[4:7])
        seq = int(req[-2:])
        row = {"requirement_id": req, "chapter": str(chapter), "srs_id": f"SRS-FR-{2371 + (chapter-471)*6 + seq-1}"}
        if name == "cases":
            row.update({"execution_status": "NOT_RUN", "business_review_status": "REVIEW_REQUIRED", "expected_result_draft": "NOT_DEFINED"})
        if name == "checklist":
            row.update({"execution_authorized": "NO", "owner_disposition": "PENDING", "owner_name_role": "", "target_date": "", "approval_or_change_reference": ""})
        if name == "gap":
            row.update({"execution_authorized": "NO", "owner_decision_status": "PENDING"})
        if name == "matrix":
            row.update({"execution_authorized": "NO", "owner_disposition": "PENDING", "owner_name_role": "", "target_date": "", "approval_or_change_reference": ""})
        rows.append(row)
    return rows


def fixture():
    b02 = sorted(audit_module.expected_ids())
    capture = []
    for chapter in range(463, 501):
        for seq in range(1, 7):
            req = f"REQ-{chapter}{seq:02d}"
            capture.append({"requirement_id": req, "chapter": str(chapter),
                            "srs_id": f"SRS-FR-{2323 + (chapter-463)*6 + seq-1}",
                            "outcome": "NOT_RUN", "business_decision": "PENDING"})
    return {"gap": rows_for("gap"), "matrix": rows_for("matrix"), "cases": rows_for("cases"),
            "checklist": rows_for("checklist"), "capture": capture}


class B02ReadinessAuditTests(unittest.TestCase):
    def test_checked_in_registers_pass_integrity_without_claiming_uat(self):
        records = {name: audit_module.read_csv(path) for name, path in audit_module.FILES.items()}
        report = audit_module.audit(records)
        self.assertEqual(report["rowCounts"]["gap"], 48)
        self.assertEqual(report["rowCounts"]["matrix"], 48)
        self.assertEqual(report["rowCounts"]["cases"], 48)
        self.assertEqual(report["rowCounts"]["checklist"], 48)
        self.assertEqual(report["rowCounts"]["capture"], 228)
        self.assertFalse(report["businessUatExecuted"])
        self.assertEqual(report["executionAuthorization"], "NO")
        self.assertEqual(report["g9"], "NOT_FROZEN")

    def test_detects_accidental_execution_authorization(self):
        records = fixture()
        records["checklist"][0]["execution_authorized"] = "YES"
        report = audit_module.audit(records)
        self.assertTrue(any("must not be execution-authorized" in error for error in report["integrityErrors"]))

    def test_detects_duplicate_and_missing_requirement_ids(self):
        records = fixture()
        records["matrix"][0]["requirement_id"] = records["matrix"][1]["requirement_id"]
        report = audit_module.audit(records)
        self.assertTrue(any("duplicate" in error for error in report["integrityErrors"]))
        self.assertTrue(any("population" in error for error in report["integrityErrors"]))

    def test_detects_master_mapping_mismatch(self):
        records = fixture()
        records["cases"][0]["srs_id"] = "SRS-FR-9999"
        report = audit_module.audit(records)
        self.assertTrue(any("srs_id mismatches master" in error for error in report["integrityErrors"]))

    def test_detects_unapproved_acceptance_or_execution_in_capture(self):
        records = fixture()
        records["capture"][48]["outcome"] = "PASS"
        records["capture"][48]["business_decision"] = "ACCEPTED"
        report = audit_module.audit(records)
        self.assertTrue(any("must remain NOT_RUN" in error for error in report["integrityErrors"]))
        self.assertTrue(any("business decision must remain pending" in error for error in report["integrityErrors"]))


if __name__ == "__main__":
    unittest.main()
