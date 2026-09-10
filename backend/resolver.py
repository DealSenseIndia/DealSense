import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse, unquote, quote
import httpx


@dataclass
class ResolvedURL:
    merchant: str
    product_id: str
    clean_url: str
    raw_url: str


def unwind_redirects(url: str, timeout: float = 10.0) -> str:
    """
    Follows redirect chains (e.g. amzn.to, amzn.in, fkrt.it, bit.ly) to find the final URL.
    Falls back to original URL on network errors.
    """
    clean = url.strip()
    if not clean.startswith("http://") and not clean.startswith("https://"):
        clean = "https://" + clean

    parsed = urlparse(clean)
    hostname = (parsed.hostname or "").lower()

    # If it is an obvious shortened link or mobile redirect
    shorteners = {"amzn.to", "amzn.in", "fkrt.it", "bit.ly", "tinyurl.com", "dl.flipkart.com"}
    is_shortener = any(s in hostname for s in shorteners)

    if not is_shortener and ("/dp/" in clean or "pid=" in clean):
        return clean

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
    }

    try:
        with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as client:
            resp = client.get(clean)
            return str(resp.url)
    except Exception:
        # Fallback to mobile UA if desktop redirect was rejected
        try:
            mobile_headers = {
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                    "Version/17.5 Mobile/15E148 Safari/604.1"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-IN,en;q=0.9",
            }
            with httpx.Client(follow_redirects=True, timeout=timeout, headers=mobile_headers) as client:
                resp = client.get(clean)
                return str(resp.url)
        except Exception:
            return clean


def _discover_amazon_asin(url: str, parsed) -> str | None:
    """Attempts multiple heuristics to find an Amazon ASIN or queries search."""
    # 1. Query parameters
    query_params = parse_qs(parsed.query)
    for qk in ("asin", "pd_rd_i", "asins", "productId"):
        vals = query_params.get(qk)
        if vals and vals[0]:
            candidate = vals[0].strip().upper()
            if len(candidate) == 10:
                return candidate

    # 2. Embedded regex anywhere in URL
    match = re.search(r"\b(B0[A-Z0-9]{8})\b", url, re.IGNORECASE)
    if match:
        return match.group(1).upper()

    # 3. Extract keywords from path or search query and discover via Amazon search
    keywords = None
    if "k=" in parsed.query:
        k_list = query_params.get("k")
        if k_list and k_list[0]:
            keywords = k_list[0].strip()
    elif parsed.path and parsed.path != "/":
        slug = parsed.path.strip("/").split("/")[0]
        if slug and slug not in ("s", "b", "gp", "dp"):
            keywords = unquote(slug.replace("-", " ").replace("+", " "))

    # 4. Local Product Graph Heuristic: Check existing verified catalog & listings
    if keywords:
        try:
            from backend.database import get_session
            from backend.models import MerchantListing, Product
            from sqlmodel import select

            k_words = [w.lower() for w in keywords.split() if len(w) > 2]
            with get_session() as session:
                listings = session.exec(select(MerchantListing).where(MerchantListing.merchant == "Amazon")).all()
                products = session.exec(select(Product)).all()
                prod_map = {p.id: (p.canonical_title or "").lower() for p in products}

                for l in listings:
                    # Match against clean URL
                    if any(kw in l.clean_url.lower() for kw in k_words):
                        return l.merchant_product_id
                    # Match against linked Product title
                    p_title = prod_map.get(l.product_id, "")
                    if any(kw in p_title for kw in k_words):
                        return l.merchant_product_id
        except Exception:
            pass

    return None


def resolve_product_url(url: str) -> ResolvedURL:
    """
    Normalizes and extracts merchant identity & clean URL from user input.
    Supports Amazon India and Flipkart standard URLs, shortlinks, and partial links.
    """
    raw_input = url.strip()
    if not raw_input.startswith("http://") and not raw_input.startswith("https://"):
        raw_input = "https://" + raw_input

    final_url = unwind_redirects(raw_input)
    parsed = urlparse(final_url)
    hostname = (parsed.hostname or "").lower()

    # --- Amazon India ---
    if "amazon" in hostname or "amzn" in hostname:

        # Regex patterns covering desktop, mobile, and alternative Amazon path formats
        patterns = [
            r"/dp/([A-Z0-9]{10})",
            r"/gp/product/([A-Z0-9]{10})",
            r"/gp/aw/d/([A-Z0-9]{10})",
            r"/product/([A-Z0-9]{10})",
            r"/d/([A-Z0-9]{10})",
            r"/asin/([A-Z0-9]{10})",
        ]
        for pattern in patterns:
            match = re.search(pattern, parsed.path, re.IGNORECASE)
            if match:
                asin = match.group(1).upper()
                clean_url = f"https://www.amazon.in/dp/{asin}"
                return ResolvedURL(
                    merchant="Amazon",
                    product_id=asin,
                    clean_url=clean_url,
                    raw_url=url,
                )

        # Fallback: Query parameters, embedded tokens, or keyword search discovery
        discovered_asin = _discover_amazon_asin(final_url, parsed)
        if discovered_asin:
            clean_url = f"https://www.amazon.in/dp/{discovered_asin}"
            return ResolvedURL(
                merchant="Amazon",
                product_id=discovered_asin,
                clean_url=clean_url,
                raw_url=url,
            )

        raise ValueError(f"Could not extract or discover Amazon product from URL: {final_url}")

    # --- Flipkart ---
    if "flipkart" in hostname:
        query_params = parse_qs(parsed.query)
        pid_list = query_params.get("pid") or query_params.get("id")
        if pid_list and pid_list[0]:
            pid = pid_list[0].strip()
            path = parsed.path if "/p/" in parsed.path else "/product/p/item"
            clean_url = f"https://www.flipkart.com{path}?pid={pid}"
            return ResolvedURL(
                merchant="Flipkart",
                product_id=pid,
                clean_url=clean_url,
                raw_url=url,
            )

        # Fallback: check path for /itm... format
        match = re.search(r"/itm([a-zA-Z0-9]+)", parsed.path)
        if match:
            pid = f"itm{match.group(1)}"
            clean_url = f"https://www.flipkart.com{parsed.path}?pid={pid}"
            return ResolvedURL(
                merchant="Flipkart",
                product_id=pid,
                clean_url=clean_url,
                raw_url=url,
            )

        raise ValueError(f"Could not extract Flipkart product ID from URL: {final_url}")

    raise ValueError(f"Unsupported merchant domain: {hostname or 'unknown'}. Please provide an Amazon or Flipkart link.")
