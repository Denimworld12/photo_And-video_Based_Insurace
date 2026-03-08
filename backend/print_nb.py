import json
import os

path = r"c:\Users\gupta\Downloads\cgiar-crop-damage-classification-challenge20240124-12750-4u8gn3\CGIR.ipynb"
try:
    with open(path, "r", encoding="utf-8") as f:
        nb = json.load(f)
    code_cells = [cell for cell in nb.get("cells", []) if cell.get("cell_type") == "code"]
    for i, cell in enumerate(code_cells):
        source = "".join(cell.get("source", []))
        print(f"\n--- Cell {i} ---")
        print(source)
except Exception as e:
    print(f"Error: {e}")
