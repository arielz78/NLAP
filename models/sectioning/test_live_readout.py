import unittest
import tempfile
from pathlib import Path

import live_readout as lr


def fixtures():
    sheet = []
    sealed = []
    scored = []
    rulings = []
    for number in range(1, 101):
        row_id = f"A-1-{number:02d}"
        record_id = f"rec{number:03d}"
        sheet.append({"sheet_row_id": row_id, "title": f"Event {number}", "description": ""})
        sealed.append(
            {
                "packet": "A",
                "sheet_row_id": row_id,
                "record_id": record_id,
                "p_include": number / 100,
                "quintile": f"Q{(number - 1) // 20 + 1}",
                "predicted_section": "For Families",
                "section_probabilities": {"For Families": 1.0},
            }
        )
        scored.append({"record_id": record_id, "gate_fit_overlap": number <= 6})
        rulings.append(
            {
                "fields": {
                    "Sheet Row ID": row_id,
                    "Verdict": "Eligible",
                    "Section": "For Families",
                    "Notes": "LINK" if number == 7 else "",
                }
            }
        )
    return sheet, sealed, scored, rulings


class PrepareInstrumentATest(unittest.TestCase):
    def test_reads_airtable_csv_export(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rulings.csv"
            path.write_text("Sheet Row ID,Verdict,Section,Notes\nA-1-01,Eligible,For Families,LINK\n", encoding="utf-8")
            rows = lr._read_rulings(path)
        self.assertEqual(rows[0]["Sheet Row ID"], "A-1-01")
        self.assertEqual(rows[0]["Notes"], "LINK")

    def test_applies_preregistered_exclusions(self):
        rows = lr.prepare_instrument_a(*fixtures())
        self.assertEqual(len(rows), 100)
        self.assertEqual(sum(row["gate_fit_overlap"] for row in rows), 6)
        self.assertTrue(next(row for row in rows if row["sheet_row_id"] == "A-1-01")["stage0_miss"])
        self.assertFalse(next(row for row in rows if row["sheet_row_id"] == "A-1-07")["primary_gate_comparable"])
        self.assertTrue(next(row for row in rows if row["sheet_row_id"] == "A-1-08")["primary_gate_comparable"])

    def test_fails_on_missing_ruling(self):
        sheet, sealed, scored, rulings = fixtures()
        with self.assertRaisesRegex(lr.ReadoutError, "rulings ID mismatch"):
            lr.prepare_instrument_a(sheet, sealed, scored, rulings[:-1])

    def test_ignores_instrument_b_rows_in_full_export(self):
        sheet, sealed, scored, rulings = fixtures()
        rulings.append(
            {"fields": {"Sheet Row ID": "B-1-01", "Instrument": "B", "Verdict": "Eligible"}}
        )
        self.assertEqual(len(lr.prepare_instrument_a(sheet, sealed, scored, rulings)), 100)

    def test_fails_on_wrong_overlap_count(self):
        sheet, sealed, scored, rulings = fixtures()
        scored[6]["gate_fit_overlap"] = True
        with self.assertRaisesRegex(lr.ReadoutError, "expected 6"):
            lr.prepare_instrument_a(sheet, sealed, scored, rulings)

    def test_fails_on_blank_verdict(self):
        sheet, sealed, scored, rulings = fixtures()
        rulings[9]["fields"]["Verdict"] = ""
        with self.assertRaisesRegex(lr.ReadoutError, "invalid or blank Verdict"):
            lr.prepare_instrument_a(sheet, sealed, scored, rulings)


if __name__ == "__main__":
    unittest.main()
