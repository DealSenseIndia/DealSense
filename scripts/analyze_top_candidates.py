import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/scored_merchants.json', 'r', encoding='utf-8') as f:
    scored = json.load(f)

with open('scripts/merchant_economics_dump.json', 'r', encoding='utf-8') as f:
    dump = json.load(f)

aff_true = [m for m in scored if m.get('affiliated') is True]
print(f"Total scored: {len(scored)}, Affiliated True: {len(aff_true)}")

print("\n--- TOP 15 AFFILIATED TRUE MERCHANTS ---")
for i, m in enumerate(aff_true[:15], 1):
    c = dump.get(str(m['id']), {})
    print(f"{i}. {m['name']} (ID: {m['id']}) | Score: {m['score']} | Domain: {m['domain']}")
    print(f"   EPC 7d: Rs.{m['epc_7d']:.2f} | EPC 90d: Rs.{m['epc_90d']:.2f} | Payout: {m['payout']} {m['payout_type']}")
    print(f"   Cookie: {c.get('cookie_duration')} | Platforms Allowed: {c.get('platforms', {}).get('allowed')}")

print("\n--- ORIGINAL 7 STATUS ---")
orig_ids = [817, 1, 101, 2588, 2589, 891, 3907]
for oid in orig_ids:
    m = next((item for item in scored if item['id'] == oid), None)
    c = dump.get(str(oid), {})
    if m:
        print(f"ID {oid}: {m['name']} | Access: {m['access']} | Affiliated: {m['affiliated']} | Score: {m['score']} | Best EPC: Rs.{m['best_epc']:.2f} | Payout: {m['payout']} {m['payout_type']}")
    else:
        print(f"ID {oid}: NOT FOUND in scored")
