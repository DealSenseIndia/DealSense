from pathlib import Path

SRC_DI4 = Path(r"D:\Gursher\Deal Intelligence 4\frontend\templates\views\home_view.html")
DEST = Path(r"d:\Gursher\Affiliate\Deal Intelligence\frontend\templates\views\home_view.html")

with open(SRC_DI4, "r", encoding="utf-8") as f:
    di4_lines = f.readlines()

with open(DEST, "r", encoding="utf-8") as f:
    dest_lines = f.readlines()

# Find the end of section 1 (hero) in both
di4_hero_end = 0
for idx, line in enumerate(di4_lines):
    if "<!-- 2. Section: What are you shopping for?" in line:
        di4_hero_end = idx
        break

dest_hero_end = 0
for idx, line in enumerate(dest_lines):
    if "<!-- 2. Section: What are you shopping for?" in line:
        dest_hero_end = idx
        break

print(f"di4_hero_end: {di4_hero_end}, dest_hero_end: {dest_hero_end}")

# Combine di4 hero with dest rest of file
new_content = "".join(di4_lines[:di4_hero_end]) + "".join(dest_lines[dest_hero_end:])

with open(DEST, "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"Successfully replaced hero in {DEST}")
