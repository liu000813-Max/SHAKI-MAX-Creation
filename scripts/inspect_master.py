"""Inspect docs/SHAKI_Product_Master.xlsx: sheets, header row, row counts, samples."""
import json
import sys
from pathlib import Path

import openpyxl

XLSX = Path(__file__).resolve().parents[1] / "docs" / "SHAKI_Product_Master.xlsx"


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    print("SHEETS:", wb.sheetnames)
    for name in wb.sheetnames:
        ws = wb[name]
        print(f"\n===== sheet: {name} | max_row={ws.max_row} max_col={ws.max_column} =====")
        rows = ws.iter_rows(values_only=True)
        try:
            header = next(rows)
        except StopIteration:
            print("(empty)")
            continue
        cols = [str(c) if c is not None else "" for c in header]
        print(f"COLUMN COUNT: {len(cols)}")
        print("HEADER:", json.dumps(cols, ensure_ascii=False))
        for i, r in enumerate(rows):
            if i >= 3:
                break
            print(f"ROW{i+1}:", json.dumps([str(x) if x is not None else "" for x in r], ensure_ascii=False)[:1200])
        # count non-empty data rows
        cnt = 0
        for r in rows:
            if any(v is not None and str(v).strip() for v in r):
                cnt += 1
        print(f"DATA ROWS (excluding header): {cnt}")
    wb.close()


if __name__ == "__main__":
    main()
