# Before this site goes live

Everything in this file is content that is either **not yet verified** or **deliberately left
generic**. None of it is a bug; each item is a decision or a check that has to happen before the
site is published. Delete a line once it is done.

Last reviewed: 2026-09-17.

---

## 1. Security page (`src/pages/security.html`)

The page only states things that are true of the product as it works today: you choose the files,
there is no connection to your accounting system, nothing is written back, nothing can move money,
and every result points at a row.

**Deliberately not claimed** — the `#pending` section says so on the page itself:

- [ ] Where an uploaded file is held, and for how long after an audit finishes.
- [ ] What is encrypted, in transit and at rest, named specifically.
- [ ] How a customer removes what they uploaded, and what happens when they ask us to.

Replace that section (and the three cards under it) with the real answers once storage, encryption,
retention and deletion are settled **and verified against how the product actually behaves**.

Also on that page:

- [ ] `#reporting` says we do not run a bug bounty programme. True today. Revisit if that changes.
- [ ] Terms of Service and Privacy links are `href="#"` placeholders in `#elsewhere` and the footer.

## 2. Guides (`src/pages/guides/*.html`)

Every step was written from general knowledge of these products, **not** from the vendor
documentation. Check each menu path, report name, button label and screenshot caption against the
official docs and correct it before publishing. The per-guide checklist lives in
`notes/unverified-guides.md`; the short version:

- [ ] QuickBooks Online — https://quickbooks.intuit.com/learn-support/en-us/help-article/export-reports/export-reports-lists-data-quickbooks-online/L0LqSlaNa_US_en_US
- [ ] Xero — https://central.xero.com/s/article/Export-a-report
- [ ] NetSuite — https://docs.oracle.com/en/cloud/saas/netsuite/
- [ ] Bill — https://help.bill.com/

Each guide file carries the same note as an HTML comment at the top.

- [ ] The file-preview tables in the guide steps (`.shot`) use **made-up vendor names, invoice
      numbers and amounts**. They illustrate the shape of a good export, not real data. Keep them
      obviously fictional or replace them with a sanitised real export.
- [ ] The security answer in each guide's FAQ repeats the security page. Update both together.

## 3. Illustrative figures in the product story

- [ ] The example result cards on the What It Finds pages (`src/pages/what-it-finds/*.html`) use
      invented vendors, invoice numbers and amounts. They show what a finding looks like; they are
      not customer data and are not claims about typical recovery.
- [ ] The app mock-ups on the landing page and the Platform pages show invented numbers for the
      same reason.

No page states a real recovery amount, a success rate, or a customer outcome. Keep it that way
until there is a verified figure to state.

- [ ] The landing page (`src/pages/index.html`) still uses the words "recovery" and "recovered" in
      the app mock-up and the copy around it. Every page built after it avoids that language on
      purpose. The landing page was left as it was, apart from the shared nav and footer — bring it
      in line when it is next revised.

## 4. Research pages (`src/pages/research/*.html`)

These are the pages that *do* carry figures, and every one of them is from a primary source and
linked on the page. The working notes are in `notes/research-sources.md`.

- [ ] Re-check each figure at publication time — these are annual publications and the numbers move:
      - APQC Open Standards Benchmarking measure 105905 (duplicate/erroneous payments, 1.5% median,
        n = 1,686)
      - Ardent Partners, *The State of ePayables 2025* (18.4% exception rate, $9.84 per invoice,
        8.2 days, 57% e-invoicing, 21.9% of staff time)
      - ACFE, *Occupational Fraud 2026: A Report to the Nations* (2,402 cases; billing schemes 21%
        of cases, $90,000 median, 14 months to detection)
      - AFP, *2026 Payments Fraud and Control Survey* (76% of organizations, checks 58%)
      - FBI IC3 2025 Annual Report (BEC losses $3.05bn)
      - GAO-26-108694 (about $186bn improper payments in FY2025, ~82% overpayments, ~$3tn since
        FY2003)
- [ ] The publication dates shown on the article pages are the source publication dates, not ours.

## 5. Popup ("Start an audit" / "Talk to us")

- [ ] The modal is **front end only**. Submitting it shows the success state and sends nothing.
      Wire it to a real endpoint (and decide where the data goes) before launch.
- [x] The contact address in the footer is `reclaimbusiness1@gmail.com`.

## 6. Navigation and naming

- [ ] **Pricing** is a nav link with `href="#"` and no page behind it. Either build the page or
      remove the link before launch.
- [ ] The product name, the logo wordmark and the domain are not final.
- [ ] Careers was deliberately left out.

## 7. Company page (`src/pages/company.html`)

- [ ] Nothing is claimed about team size, funding, location, customers or history, because none of
      it is settled. If any of that is added, it has to be true and checkable.
- [ ] The "Where our numbers come from" tiles link straight to the publishers. Keep them in step
      with `notes/research-sources.md`.
