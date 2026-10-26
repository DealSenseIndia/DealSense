import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const rows = await db.all(sql`
    select p.slug, p.title,
           count(distinct l.merchant) as stores,
           count(o.id) as obs
    from products p
    join listings l on l.product_id = p.id
    left join observations o on o.listing_id = l.id
    group by p.id
    having stores > 1 and obs > 6
    order by obs desc
    limit 15
  `);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main();
