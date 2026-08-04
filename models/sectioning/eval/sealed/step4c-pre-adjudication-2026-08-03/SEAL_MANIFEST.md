# Step 4c pre-adjudication evidence seal

Sealed at **2026-08-03 6:41 PM America/Toronto**, before the AllEvents inventory and before any adjudication edits observed in this worktree.

This directory is deliberately outside both fixed output paths in `build_step4c_error_table.py`. The directory name identifies the evidence state and date, and its creation was guarded to fail if the directory already existed. A future generator run can overwrite the working outputs, but it cannot address these copies.

| Sealed copy | Generator output copied from | Bytes | SHA-256 |
|---|---|---:|---|
| `step4c_error_mechanisms.pre-adjudication.json` | `models/sectioning/eval/step4c_error_mechanisms.json` | 36,948 | `9A38140AE75783AAC75B9D785D42AE8707BD245F72FBE96AF1998A4072CAFE70` |
| `R7_Step4c_Error_Mechanism_Table.pre-adjudication.md` | `docs/r7/R7_Step4c_Error_Mechanism_Table.md` | 39,822 | `CA8FF32FF4A6E11A8D450F36BCE558D4AA9C641AF6E6BBCBED5FE606B38220D7` |

Immediately after copying, each sealed file matched its source byte-for-byte by SHA-256.
