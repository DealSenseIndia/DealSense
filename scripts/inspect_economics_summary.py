import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/merchant_economics_dump.json', 'r', encoding='utf-8') as f:
    dump = json.load(f)

with open('scripts/scored_merchants.json', 'r', encoding='utf-8') as f:
    scored = json.load(f)

print(f"Total dumped: {len(dump)}, Total scored: {len(scored)}")

for idx, m in enumerate(scored[:20], 1):
    c_data = dump.get(str(m['id']), {})
    plat = c_data.get('platforms', {})
    media = c_data.get('media', {})
    payout_cats = c_data.get('payout_categories', [])
    print("=" * 60)
    print(f"Rank {idx}: {m['name']} (ID: {m['id']}) - Score: {m['score']}")
    print(f"Domain: {m['domain']} | Access: {m['access']} | Affiliated: {m['affiliated']}")
    print(f"EPC 7d: ₹{m['epc_7d']:.2f} | EPC 90d: ₹{m['epc_90d']:.2f} | Best EPC: ₹{m['best_epc']:.2f}")
    print(f"Payout: {m['payout']} {m['payout_type']} | Cookie: {c_data.get('cookie_duration')}")
    print(f"Tracking: {c_data.get('tracking_time')} | Validation: {c_data.get('validation_time')} | Payment: {c_data.get('payment_time')}")
    print(f"Allowed Platforms: {plat.get('allowed')}")
    print(f"Disallowed Platforms: {plat.get('disallowed')}")
    print(f"Deeplink Allowed: {c_data.get('deeplink_allowed')}")
    if payout_cats:
        print("Payout Categories (sample):")
        for pc in payout_cats[:3]:
            print(f"  - {pc.get('name')}: {pc.get('rate') or pc.get('payout')}")
