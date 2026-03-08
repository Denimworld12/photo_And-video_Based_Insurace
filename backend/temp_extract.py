import json
import glob
import os

path = r"c:\Users\gupta\Downloads\cgiar-crop-damage-classification-challenge20240124-12750-4u8gn3"
notebooks = glob.glob(os.path.join(path, "*.ipynb"))

for nb_file in notebooks:
    print(f"\n--- Notebook: {os.path.basename(nb_file)} ---")
    try:
        with open(nb_file, "r", encoding="utf-8") as f:
            nb = json.load(f)
        code_cells = [cell for cell in nb.get("cells", []) if cell.get("cell_type") == "code"]
        for i, cell in enumerate(code_cells):
            source = "".join(cell.get("source", []))
            lower_source = source.lower()
            if any(k in lower_source for k in ["request", "beautifulsoup", "selenium", "urllib", "api", "scrape", "beautifulmention"]):
                print(f"Cell {i} (contains scraping/api keywords):")
                print(source)
                print("-" * 40)
    except Exception as e:
        print(f"Error reading notebook: {e}")
