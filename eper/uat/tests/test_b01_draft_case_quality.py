"""Structural regression checks for the 48 B01 draft test cases.

These checks validate completeness and guard status/identity; they do not approve
business oracles or authorize UAT execution.
"""
import csv
import unittest
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[1] / "B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv"
EXPECTED_REQUIREMENTS = {
    f"REQ-{chapter}{sequence:02d}"
    for chapter in range(463, 471)
    for sequence in range(1, 7)
}
REQUIRED_DRAFT_FIELDS = (
    "preconditions_draft",
    "steps_draft",
    "expected_result_draft",
    "negative_path_draft",
    "evidence_to_capture",
    "proposed_measurable_oracle_draft",
    "oracle_owner_decisions_required",
)
EXPECTED_PATTERNS = {"XX01", "XX02", "XX03", "XX04", "XX05", "XX06"}


def load_cases():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


class B01DraftCaseQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = load_cases()

    def test_exactly_covers_the_48_requirement_ids_once(self):
        requirement_ids = [row["requirement_id"].strip() for row in self.cases]
        self.assertEqual(len(self.cases), 48)
        self.assertEqual(len(set(requirement_ids)), 48)
        self.assertEqual(set(requirement_ids), EXPECTED_REQUIREMENTS)

    def test_requirement_to_srs_mapping_is_exact_and_contiguous(self):
        ordered = sorted(self.cases, key=lambda row: (int(row["chapter"]), row["requirement_id"]))
        for index, row in enumerate(ordered):
            expected_srs = f"SRS-FR-{2323 + index}"
            self.assertEqual(row["srs_id"], expected_srs, row["requirement_id"])
            self.assertEqual(row["brd_id"], f"BRD-001-{row['requirement_id']}", row["requirement_id"])

    def test_each_chapter_covers_all_six_capability_patterns(self):
        for chapter in range(463, 471):
            chapter_rows = [row for row in self.cases if int(row["chapter"]) == chapter]
            self.assertEqual(len(chapter_rows), 6, f"Chapter {chapter} must have six cases")
            self.assertEqual(
                {row["pattern"] for row in chapter_rows}, EXPECTED_PATTERNS,
                f"Chapter {chapter} must cover XX01–XX06 exactly",
            )

    def test_draft_steps_oracles_and_evidence_are_populated(self):
        for row in self.cases:
            for field in REQUIRED_DRAFT_FIELDS:
                self.assertTrue(
                    (row.get(field) or "").strip(),
                    f"{row.get('case_id')} has an empty {field}",
                )

    def test_no_draft_case_is_implicitly_approved_or_executed(self):
        for row in self.cases:
            self.assertEqual(row["case_status"], "DRAFT_TEMPLATE_NOT_APPROVED", row["case_id"])
            self.assertEqual(row["execution_status"], "NOT_RUN", row["case_id"])
            self.assertEqual(row["business_review_status"], "REVIEW_REQUIRED", row["case_id"])

    def test_chapter_463_source_control_blocker_is_explicit_on_all_six_cases(self):
        chapter_cases = [row for row in self.cases if int(row["chapter"]) == 463]
        self.assertEqual(len(chapter_cases), 6)
        for row in chapter_cases:
            notes = row.get("notes", "").lower()
            owner_actions = row.get("oracle_owner_decisions_required", "").lower()
            self.assertIn("source-control blocker", notes, row["case_id"])
            self.assertIn("correction request is not approved", notes, row["case_id"])
            self.assertIn("approved reissued/superseding chapter 463 procurement brd", owner_actions, row["case_id"])
            self.assertEqual(row["case_status"], "DRAFT_TEMPLATE_NOT_APPROVED", row["case_id"])
            self.assertEqual(row["execution_status"], "NOT_RUN", row["case_id"])

    def test_chapters_464_to_470_name_domain_specific_source_acquisition(self):
        domain_labels = {
            464: "Supplier Relationship Management",
            465: "Inventory / Warehouse / Stock Management",
            466: "Order Management",
            467: "Logistics / Transportation",
            468: "Manufacturing / Production",
            469: "Quality Management",
            470: "Maintenance / Asset Reliability",
        }
        for row in self.cases:
            chapter = int(row["chapter"])
            if chapter < 464:
                continue
            notes = row.get("notes", "")
            self.assertIn("Source-acquisition action:", notes, row["case_id"])
            self.assertIn(domain_labels[chapter], notes, row["case_id"])
            self.assertIn("DATA/API/EVENT", notes, row["case_id"])
            self.assertIn("do not infer N/A", notes, row["case_id"])

    def test_source_gaps_are_not_falsely_promoted_to_exact_design_bindings(self):
        for row in self.cases:
            notes = (row.get("notes") or "").lower()
            self.assertIn("exact approved hld/lld", notes, row["case_id"])
            self.assertIn("open", notes, row["case_id"])
            self.assertIn("does not approve", notes, row["case_id"])


if __name__ == "__main__":
    unittest.main()
