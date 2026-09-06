import json
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import Product, MerchantListing, PriceObservation
from backend.service import ingest_and_evaluate

test_products = [
    ("Amazon - Philips Air Fryer", "https://www.amazon.in/dp/B0D14BB5XY?th=1"),
    ("Flipkart - Motorola G37 Power", "https://www.flipkart.com/motorola-g37-power-pantone-nautical-blue-128-gb/p/itm48ade38c32669?pid=MOBHMX5YNNYGMVWH"),
    ("Amazon - Wakefit Sleeping Pillow", "https://www.amazon.in/dp/B07L6GZYDV/?th=1"),
    ("Flipkart - Pigeon Gas Stove", "https://www.flipkart.com/pigeon-popular-cooktop-glass-manual-gas-stove/p/itm782943770c4fe?pid=GSTGG7GKGJZKUCUG"),
]

def run():
    print("\n" + "=" * 70)
    print("      DEAL INTELLIGENCE: END-TO-END INGESTION & EVALUATION")
    print("=" * 70)

    for label, url in test_products:
        print(f"\n---> Testing: {label}")
        print(f"     URL: {url[:70]}...")
        try:
            report = ingest_and_evaluate(url)
            p = report["product"]
            l = report["listing"]
            pr = report["pricing"]
            d = report["decision"]

            print("\n  [VERDICT CARD]")
            verdict_badge = {
                "BUY": "[BUY NOW]",
                "FAIR": "[FAIR PRICE]",
                "WAIT": "[WAIT / AVOID]",
                "AVOID": "[OUT OF STOCK]",
            }.get(d["verdict"], d["verdict"])

            print(f"  Status:         {verdict_badge} (Score: {d['score']}/100, Confidence: {d['confidence']})")
            print(f"  Product:        {p['title'][:60]}")
            print(f"  Merchant:       {l['merchant']} (ID: {l['merchant_product_id']})")
            mrp_str = f"Rs. {pr['mrp']:,.0f}" if pr['mrp'] else "N/A"
            disc_str = f"({pr['discount_pct']}% OFF)" if pr['discount_pct'] else ""
            print(f"  Current Price:  Rs. {pr['current_price']:,.0f} {disc_str} | MRP: {mrp_str}")
            print("  Evidence:")
            for e in d["evidence"]:
                print(f"    - {e}")

        except Exception as err:
            print(f"  [ERROR]: {err}")

    print("\n" + "=" * 70)
    print("      VERIFYING PERSISTED DATABASE RECORDS (SQLite)")
    print("=" * 70)

    with get_session() as session:
        products = session.exec(select(Product)).all()
        listings = session.exec(select(MerchantListing)).all()
        observations = session.exec(select(PriceObservation)).all()

        print(f"\nTotal Canonical Products in DB:    {len(products)}")
        print(f"Total Merchant Listings in DB:     {len(listings)}")
        print(f"Total Price Observations in DB:    {len(observations)}")

        print("\nLast 5 Price Observations:")
        for obs in observations[-5:]:
            print(f"  Listing #{obs.listing_id} | Rs. {obs.price:,.0f} (MRP: Rs. {obs.mrp or 0:,.0f}) | Date: {obs.observed_at.strftime('%Y-%m-%d %H:%M:%S')} | Source: {obs.source}")

    print("\n" + "=" * 70)
    print("Pipeline Execution Complete!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    run()
