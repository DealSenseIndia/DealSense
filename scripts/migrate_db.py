import sqlite3

def run_migration():
    conn = sqlite3.connect("data/deal_intelligence.db")
    cursor = conn.cursor()

    def add_col(table, col, col_type):
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
            print(f"Added {col} to {table}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                pass
            else:
                print(f"Notice: {col} on {table}: {e}")

    # products
    for col, c_type in [
        ("canonical_slug", "TEXT"),
        ("mpn", "TEXT"),
        ("gtin", "TEXT"),
        ("category_id", "INTEGER"),
        ("product_type", "TEXT"),
        ("description", "TEXT"),
        ("updated_at", "TIMESTAMP"),
    ]:
        add_col("products", col, c_type)

    # merchant_listings
    for col, c_type in [
        ("variant_id", "INTEGER"),
        ("merchant_id", "INTEGER"),
        ("affiliate_url", "TEXT"),
        ("title_at_merchant", "TEXT"),
        ("seller_id", "TEXT"),
        ("seller_name", "TEXT"),
        ("availability", "TEXT DEFAULT 'in_stock'"),
        ("current_price", "REAL"),
        ("currency", "TEXT DEFAULT 'INR'"),
        ("shipping_cost", "REAL DEFAULT 0.0"),
        ("data_source", "TEXT DEFAULT 'catalog_feed'"),
        ("source_confidence", "TEXT DEFAULT 'high'"),
        ("active", "BOOLEAN DEFAULT 1"),
        ("created_at", "TIMESTAMP"),
    ]:
        add_col("merchant_listings", col, c_type)

    # price_observations
    for col, c_type in [
        ("shipping_cost", "REAL DEFAULT 0.0"),
        ("effective_price", "REAL"),
        ("confidence", "TEXT DEFAULT 'high'"),
    ]:
        add_col("price_observations", col, c_type)

    conn.commit()
    conn.close()
    print("Database columns migrated successfully.")

if __name__ == "__main__":
    run_migration()
