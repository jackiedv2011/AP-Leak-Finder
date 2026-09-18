# Reclaim master prompt — Claims mechanics, product, and implementation

You are the product-and-reality investigator for an early-stage student startup called **Reclaim**. Your task is to trace how a retail or distributor deduction could move from confusing paperwork to a valid, evidence-supported claim—and then design the sharpest first Reclaim product that could help without pretending to have powers it does not have.

## Context

Reclaim is being rethought. Its old promise was broadly detecting questionable business spending. The team is now exploring a more concrete outcome:

> A small consumer brand receives less than it expected from a distributor or retailer. Reclaim compares the records, identifies whether a deduction appears unsupported, gathers or requests the proof, explains the case, tracks the deadline, and helps the brand prepare an accurate dispute.

Potential examples include shortages, wrong pricing, duplicate promotional deductions, freight allowances, compliance chargebacks, and other short-pays. The team is not yet committed to any distributor, retailer, claim type, workflow, or product interface.

The team is made up of students. That does not limit the ambition, but it does mean the report must distinguish a responsible early prototype from functionality that depends on business partnerships, regulated access, credentials, mature security, legal advice, or operating as a customer’s representative.

Previous research has found that records can be scattered across remittance emails, PDFs, supplier portals, invoices, purchase orders, bills of lading, proof-of-delivery files, price sheets, promotion agreements, ERP/accounting systems, and 3PL systems. Verify that rather than accepting it blindly.

## Core mission

Work backward from a real result: a credit, corrected payment, resolved claim, or accurately determined valid deduction. Map the complete path from payment shortfall to outcome. Then identify the smallest product that produces meaningful value along that path.

Do not design a generic dashboard. Do not assume that “an AI agent reads PDFs” is a product. The product must make a specific workflow faster, safer, clearer, or more likely to succeed.

## Claims and evidence research

Investigate one or more concrete distributor/retailer lanes—such as UNFI, KeHE, regional grocery distributors, Walmart, Target, or others that prove more relevant. For each serious lane and claim type, answer:

### The event

- What deduction, chargeback, or short-pay occurs?
- Who takes the money and what rule, agreement, routing guide, price agreement, or policy governs it?
- Is it a genuine obligation the counterparty may owe, or merely a request for a better price? Be ruthless about that difference.

### The evidence

- What exact documents establish what should have happened and what did happen?
- Which identifiers need to match: invoice number, PO number, SKU/UPC, shipment number, quantity, date, price, promotion ID, deduction code, carrier reference, or something else?
- What evidence is sufficient for a strong dispute versus merely suggestive?
- What information is usually missing, and who has it?
- Which deduction type has the cleanest, least ambiguous evidence for a first prototype?

### The process

- Where is the deduction received and where is it disputed: email, distributor portal, retailer portal, EDI, a claims center, a credit-memo process, or support?
- What deadlines, documentary requirements, approval stages, appeal paths, and submission restrictions exist?
- Who can submit: owner, supplier representative, authorized user, broker, 3PL, accountant, or third-party service?
- Are there official APIs, delegated roles, export options, or documented partner programs? Do not assume a portal can legally or safely be automated.
- How does the customer learn whether they won, and how is the credit or corrected payment confirmed?

### The economics and risk

- What is a plausible amount and frequency at the specific customer size being considered?
- How likely are false positives, and what happens if a brand challenges a valid deduction?
- Could disputes harm the supplier’s retailer/distributor relationship?
- Is the workflow repeatable enough to retain customers?
- What could close the channel: a policy update, shorter window, portal restriction, incumbent integration, or a missing required document?

Favor primary sources: supplier terms, routing guides, deduction policies, support documentation, retailer/distributor portal instructions, official partner/API documentation, and actual forms. If direct documentation is unavailable, say that plainly instead of reverse-engineering certainty from vendor blogs.

## Product design mission

Based on the real workflow, generate several distinct product directions. Do not limit yourself to one interface concept. Explore what Reclaim could be, for example:

- a deadline-and-proof workspace for one class of deductions;
- an email/PDF intake system that turns a remittance into a structured claim queue;
- an evidence checklist and case-packet builder;
- a customer-guided, “you click submit” dispute assistant;
- a human-in-the-loop recovery service with software supporting it;
- a prevention product that identifies the operational root cause before the next chargeback;
- another better direction you discover.

For each product direction, explain:

- Who uses it and what moment makes them open it?
- What is its input, processing, output, and concrete outcome?
- What does it deliberately *not* claim to do?
- Why would it be better than spreadsheets, a broker, an accountant, or an existing deduction platform?
- What makes it trustworthy enough for a founder to upload confidential financial documents?
- Which parts can be rules-based and auditable, and which genuinely need human judgment?
- How it could expand from an initial narrow wedge into a larger Reclaim platform.

## Implementation reality

Research and recommend an implementation path, but do not prematurely turn this into an enterprise architecture exercise. Separate the work into three layers:

### First prototype / this-semester level

What can be demonstrated responsibly with redacted or customer-exported documents? Consider uploads of PDFs/CSVs, document extraction, manual review, simple record matching, a deadline tracker, and a generated evidence checklist or dispute draft. Be specific about what can be built without direct account access or a live integration.

### Early real-customer version

What needs to be true to use authentic data safely? Cover document consent, secure storage, permissions, human review, deleted files, audit trails, customer approval before a submission, and handling of errors. Explain the product choices that lower trust friction.

### Later-scale version

Which elements require official integrations, structured EDI data, accounting/ERP connections, retailer/distributor partnerships, mature security practices, legal review, or an operations team? Explain why—and do not claim that these are easy.

## Deliverable

Create a detailed but plain-English product and feasibility report. Suggested structure:

1. Bottom line: the clearest claim type and workflow worth testing first.
2. A real end-to-end claim map—from remittance to evidence to resolution.
3. The documents, fields, rules, deadlines, and unknowns that matter.
4. Product directions considered, including a recommendation and rejected options.
5. A concrete first-user flow: what the founder uploads, sees, approves, and does.
6. A staged implementation plan: prototype, early customer version, later platform.
7. Failure modes, safety/trust concerns, and hard constraints.
8. The fastest manual tests to prove the workflow before building heavily.
9. Sources, citations, confidence levels, and open questions.

Use a different structure if it provides a more useful answer. End with a clear recommendation:

> **The first Reclaim product should help [specific user] handle [specific claim type] by [specific workflow], because [specific proof and process make it feasible].**

Then name the one fact that would make you abandon or materially change that recommendation.
