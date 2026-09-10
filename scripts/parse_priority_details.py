import json

with open('scripts/audit_priority_dump.json', 'r', encoding='utf-8') as f:
    dump = json.load(f)

detailed = dump.get('detailed_campaigns', {})
conversions = dump.get('link_conversions', {})

order = ["Amazon India", "Flipkart", "Myntra"]

for m in order:
    c = detailed.get(m, {})
    conv = conversions.get(m, {})
    print("=" * 80)
    print(f"MERCHANT: {m} (Campaign ID: {c.get('id')})")
    print("=" * 80)
    print(f"Name:               {c.get('name')}")
    print(f"Domain:             {c.get('domain')}")
    print(f"Status:             {c.get('status')}")
    print(f"Access Status:      {c.get('access_status')}")
    print(f"Affiliated Flag:    {conv.get('affiliated')}")
    print(f"Payout:             {c.get('payout')} {c.get('payout_currency')} ({c.get('payout_type')})")
    print(f"Cookie Duration:    {c.get('cookie_duration')}")
    print(f"Tracking Time:      {c.get('tracking_time')}")
    print(f"Validation Time:    {c.get('validation_time')}")
    print(f"Payment Time:       {c.get('payment_time')}")
    print(f"Deeplink Allowed:   {c.get('deeplink_allowed')}")
    print(f"Conversion Flow:    {c.get('conversion_flow')}")
    print(f"Platforms Allowed:  {c.get('platforms', {}).get('allowed')}")
    print(f"Platforms Disallowed: {c.get('platforms', {}).get('disallowed')}")
    print(f"Media Allowed:      {c.get('media', {}).get('allowed')}")
    print(f"Media Disallowed:   {c.get('media', {}).get('disallowed')}")
    
    p_cats = c.get('payout_categories', [])
    print(f"Payout Tiers count: {len(p_cats)}")
    for p in p_cats[:8]:
        print(f"  * {p.get('name')}: {p.get('payout')} ({p.get('payout_type')})")
    if len(p_cats) > 8:
        print(f"  ... plus {len(p_cats) - 8} more tiers")

    print("\nIMPORTANT RULES & RESTRICTIONS (Plain Text):")
    plain = c.get('important_info_plain', '')
    for line in plain.split("\n"):
        if line.strip():
            print(f"  {line}")
    print("\n")
