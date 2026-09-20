# DealSense — Engineering Rules & Pair-Programming Constraints

## 1. Test Suite Integrity (Rule #1)
- **Zero Broken Tests Permitted**: 48 out of 48 unit tests are currently passing. No code changes may be committed that break existing tests.
- **Never Mock Away Failures**: If an extractor test fails because of markup changes, update the parser selectors or fallback chain; do not disable or skip the test.

## 2. Stealth Scraping & Anti-Bot Constraints
- **Header Sanitization**: Always send realistic browser headers (`User-Agent`, `Accept-Language: en-US,en;q=0.9`, `Sec-Ch-Ua`).
- **Challenge Detection**: Detect Amazon CAPTCHA forms (`/errors/validateCaptcha`) and Flipkart verification pages. When challenged, never hammer the domain—back off exponentially and flag telemetry.
- **Affiliate Tag Protection**: Always strip competitor referral codes (`tag=`, `affid=`, `ascsubtag=`) before applying DealSense or sub-affiliate tags.

## 3. Data Normalization Standards
- **Currency & Numbers**: All prices must be stored as clean floats without currency symbols (₹), commas, or whitespace.
- **Image Fallbacks**: Never allow broken images. Always invoke the Image Self-Healing heuristics so that category-appropriate SVGs appear on error.

## 4. Environment & Dependency Rules
- Always use the project-local `.venv`. Never run global `pip install`.
- Always update `Memory.md` after completing a milestone, fixing an extractor regression, or adding tests.
