import json
import os

path = r"c:\Users\gupta\Downloads\cgiar-crop-damage-classification-challenge20240124-12750-4u8gn3"
output_path = r"c:\Users\gupta\OneDrive\Documents\project\PBI\backend\extracted_nbs.py"

with open(output_path, "w", encoding="utf-8") as out:
    for nb_name in ["CGIR.ipynb", "PBI_Model_Colab_Fixed.ipynb", "Crop_Damage_Insurance_Model.ipynb"]:
        nb_file = os.path.join(path, nb_name)
        if not os.path.exists(nb_file): continue
        out.write(f"\n\n# =========================================\n# NOTEBOOK: {nb_name}\n# =========================================\n\n")
        try:
            with open(nb_file, "r", encoding="utf-8") as f:
                nb = json.load(f)
            code_cells = [cell for cell in nb.get("cells", []) if cell.get("cell_type") == "code"]
            for i, cell in enumerate(code_cells):
                out.write(f"\n# --- Cell {i} ---\n")
                source = "".join(cell.get("source", []))
                out.write(source + "\n")
        except Exception as e:
            out.write(f"# Error reading: {e}\n")
