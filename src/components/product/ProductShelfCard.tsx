import Link from "next/link";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { formatINR } from "@/lib/utils";

export interface ShelfProduct {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  /** Dated price points we hold for this product across its listings. */
  points: number;
}

/** The product tile used on category and brand pages. */
export function ProductShelfCard({ product }: { product: ShelfProduct }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-emerald-400/50"
    >
      <div className="relative aspect-square w-full bg-subtle">
        <ProductThumb
          imageUrl={product.imageUrl}
          alt={product.title}
          merchant={product.merchant}
          className="h-full w-full"
          sizes="(max-width: 640px) 50vw, 240px"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-headline group-hover:text-[var(--dw-green-mid)]">
          {product.title}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="tabular text-[15px] font-extrabold text-headline">
            {formatINR(product.price)}
          </span>
          <span className="text-[10.5px] font-semibold text-muted">
            {product.points.toLocaleString("en-IN")} dated prices
          </span>
        </div>
      </div>
    </Link>
  );
}
