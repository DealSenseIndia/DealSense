# Deal Intelligence / DealSense — Workspace Rules

## 1. Test Suite Integrity (Rule #1)
- **Zero Broken Tests Permitted**: Exactly **201 out of 201 tests** are currently passing green.
- Any change that fails a test must be reverted or fixed immediately before proceeding.

## 2. Scraping & Affiliate Integrity
- Always strip competitor referral codes (`tag=`, `affid=`, `ascsubtag=`) before applying DealSense or sub-affiliate tags.
- Amazon requires `tag=`; Flipkart requires `affid=`. Never conflate the two.
- Implement exponential backoff when CAPTCHA forms (`validateCaptcha`) or 503/429 status codes appear.

## 3. Dependency Discipline
- Always use the project-local `.venv`: `.venv\Scripts\python.exe` and `.venv\Scripts\pytest.exe`.
- Never run global `pip install`.
- Update `Memory.md` after every milestone or bugfix.
