import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/scored_merchants.json', 'r', encoding='utf-8') as f:
    scored = json.load(f)

with open('scripts/merchant_economics_dump.json', 'r', encoding='utf-8') as f:
    dump = json.load(f)

# Candidate list to map
merchants_to_map = [
    # Top 10 Active
    "Lenovo India", "Tata Cliq", "Vijay Sales", "Acer", "Nykaa Beauty",
    "Pepperfry", "Boat", "Sleepwell", "Asus India", "Marks and Spencer",
    # Setup / High Value add-ons
    "Godrej Interio", "Sleepycat",
    # Original 7 pending / critical
    "Amazon India", "Flipkart", "Myntra", "Ajio"
]

print("| Merchant | Mobile | Electronics | PC | Gaming | Audio | Appliances | Furniture | Home | Fashion | Beauty | Setup Value |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|")

# Define mapping based on verified catalog reality:
# Lenovo: PC (HIGH), Gaming (HIGH), Electronics (MED), Mobile (LOW/Motorola), Audio (LOW), Furniture (NONE), Home (NONE), Fashion (NONE), Beauty (NONE), Setup Value (HIGH - WFH/Desks/Monitors)
# Vijay Sales: Mobile (HIGH), Electronics (HIGH), PC (HIGH), Gaming (MED), Audio (HIGH), Appliances (HIGH), Furniture (NONE), Home (MED), Fashion (NONE), Beauty (NONE), Setup Value (HIGH)
# Acer: PC (HIGH), Gaming (HIGH), Electronics (MED), Mobile (NONE), Audio (LOW), Appliances (NONE), Furniture (NONE), Home (NONE), Fashion (NONE), Beauty (NONE), Setup Value (HIGH - Monitors/Desks)
# Boat: Audio (HIGH), Electronics (MED), Mobile (LOW - accessories), Gaming (MED - headsets), Appliances (NONE), Furniture (NONE), Home (NONE), Fashion (LOW - wearables), Beauty (NONE), Setup Value (MED)
# Pepperfry: Furniture (HIGH), Home (HIGH), Appliances (LOW), Electronics (NONE), PC (NONE), Mobile (NONE), Gaming (LOW - gaming chairs), Audio (NONE), Fashion (NONE), Beauty (NONE), Setup Value (HIGH - Desks/Ergonomic chairs)
# Sleepwell: Furniture (MED - beds/mattresses), Home (HIGH), Bedroom Setup Value (HIGH), Others (NONE)
# Godrej Interio: Furniture (HIGH), Home (HIGH), Setup Value (HIGH - Desks/office chairs), Others (NONE)
# Tata Cliq: Mobile (MED), Electronics (HIGH), PC (MED), Gaming (MED), Audio (HIGH), Appliances (HIGH), Furniture (LOW), Home (HIGH), Fashion (HIGH), Beauty (HIGH), Setup Value (HIGH)
# Nykaa Beauty: Beauty (HIGH), Home (LOW - bath/wellness), Others (NONE), Setup Value (NONE)
# Marks and Spencer: Fashion (HIGH), Home (MED - decor/bedding), Beauty (MED), Others (NONE), Setup Value (LOW)
# Asus India: PC (HIGH), Gaming (HIGH), Electronics (MED), Mobile (LOW - ROG phone), Audio (LOW - headsets), Appliances (NONE), Furniture (NONE), Home (NONE), Fashion (NONE), Beauty (NONE), Setup Value (HIGH)
# Amazon India: All HIGH
# Flipkart: All HIGH
# Myntra: Fashion (HIGH), Beauty (HIGH), Home (MED), Audio (LOW - lifestyle audio), Electronics (LOW), Others (NONE)
# Ajio: Fashion (HIGH), Home (MED), Beauty (MED), Others (NONE)

matrix = [
    ("Lenovo India (ID: 823)", "LOW", "HIGH", "HIGH", "HIGH", "LOW", "NONE", "NONE", "NONE", "NONE", "NONE", "HIGH"),
    ("Tata Cliq (ID: 2588)", "MEDIUM", "HIGH", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "LOW", "HIGH", "HIGH", "HIGH", "HIGH"),
    ("Vijay Sales (ID: 4164)", "HIGH", "HIGH", "HIGH", "MEDIUM", "HIGH", "HIGH", "NONE", "MEDIUM", "NONE", "NONE", "HIGH"),
    ("Acer (ID: 4360)", "NONE", "MEDIUM", "HIGH", "HIGH", "LOW", "NONE", "NONE", "NONE", "NONE", "NONE", "HIGH"),
    ("Asus India (ID: 11211)", "LOW", "HIGH", "HIGH", "HIGH", "LOW", "NONE", "NONE", "NONE", "NONE", "NONE", "HIGH"),
    ("Boat (ID: 4232)", "NONE", "MEDIUM", "NONE", "MEDIUM", "HIGH", "NONE", "NONE", "NONE", "LOW", "NONE", "MEDIUM"),
    ("Pepperfry (ID: 107)", "NONE", "NONE", "NONE", "LOW", "NONE", "LOW", "HIGH", "HIGH", "NONE", "NONE", "HIGH"),
    ("Sleepwell (ID: 5586)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "MEDIUM", "HIGH", "NONE", "NONE", "HIGH"),
    ("Godrej Interio (ID: 238)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "HIGH", "HIGH", "NONE", "NONE", "HIGH"),
    ("Nykaa Beauty (ID: 891)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "LOW", "NONE", "HIGH", "NONE"),
    ("Marks & Spencer (ID: 4094)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "MEDIUM", "HIGH", "MEDIUM", "LOW"),
    ("Nykaa Fashion (ID: 3907)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "LOW", "HIGH", "LOW", "NONE"),
    ("Amazon India* (ID: 817)", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH"),
    ("Flipkart* (ID: 1)", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH", "HIGH"),
    ("Myntra* (ID: 101)", "NONE", "LOW", "NONE", "NONE", "LOW", "NONE", "NONE", "MEDIUM", "HIGH", "HIGH", "LOW"),
    ("Ajio* (ID: 2589)", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "MEDIUM", "HIGH", "MEDIUM", "NONE")
]

for row in matrix:
    print(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]} | {row[6]} | {row[7]} | {row[8]} | {row[9]} | {row[10]} | {row[11]} |")
