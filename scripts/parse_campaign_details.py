import json
import re

def clean_html(text):
    if not text:
        return ""
    clean = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    clean = clean.replace("<li>", "\n  * ").replace("</li>", "")
    clean = re.sub(r"<[^>]+>", "", clean)
    lines = [line.strip() for line in clean.split("\n") if line.strip()]
    return "\n".join(lines)

with open('scripts/audit_campaigns_dump.json', 'r', encoding='utf-8') as f:
    dump = json.load(f)

details = dump.get('all_campaign_details', {})
targets = {
    "1": "Flipkart"
}

for cid, m_name in targets.items():
    c = details.get(cid, {})
    print("=" * 80)
    print(f"MERCHANT: {m_name} (Campaign ID: {cid})")
    print("=" * 80)
    print(f"campaign_name:          {c.get('name')}")
    print(f"domain:                 {c.get('domain')}")
    print(f"access_status:          {c.get('access_status')}")
    print(f"status:                 {c.get('status')}")
    print(f"payout_type:            {c.get('payout_type')}")
    print(f"payout:                 {c.get('payout')} {c.get('payout_currency')}")
    print(f"cookie_duration:        {c.get('cookie_duration')}")
    print(f"tracking_time:          {c.get('tracking_time')}")
    print(f"validation_time:        {c.get('validation_time')}")
    print(f"deeplink_allowed:       {c.get('deeplink_allowed')}")
    print(f"country:                {c.get('country')}")
    print(f"platforms:              {c.get('platforms')}")
    print(f"media:                  {c.get('media')}")
    print(f"missing_trans_allowed:  {c.get('missing_trans_allowed')}")
    print(f"missing_trans_claim:    {c.get('missing_trans_claim_window')}")
    
    # Calculate max advertised payout from payout_categories if available
    p_cats = c.get('payout_categories', [])
    max_p = c.get('payout')
    print(f"Payout Tiers ({len(p_cats)} tiers):")
    for p in p_cats:
        print(f"  * {p.get('name')}: {p.get('payout')} ({p.get('payout_type')})")

    # Important restrictions
    info_html = c.get('important_info_html') or c.get('important_info') or ""
    print("\nIMPORTANT RESTRICTIONS & INFO:")
    cleaned = clean_html(info_html)
    for line in cleaned.split("\n"):
        print(f"  {line}")
    print("\n")
