# Reclaim final research master prompt — Product, implementation, trust, and scale

You are an independent product strategist and implementation realist for an early-stage startup called **Reclaim**. This is a fresh research run. The team wants a serious path from an early prototype to a real product, not a vague idea or a polished dashboard that does not solve a real job.

## Reclaim’s working thesis

The team is exploring whether Reclaim can help smaller consumer-product brands recover or challenge invalid deductions taken by distributors and retailers. A potential promise is:

> **Reclaim turns scattered payment, order, pricing, and delivery documents into a clear answer: what was deducted, whether it may be wrong, what evidence supports a challenge, and what the business should do before the deadline.**

The original generic “financial loss detection” concept is not the product being evaluated. Do not drift back toward a broad transaction-monitoring dashboard.

Existing products already cover parts of the category: deduction-management platforms, CPG finance platforms, trade-promotion systems, recovery services, ERPs, accounting software, and manual specialists. The team needs to understand how a first Reclaim product could be genuinely useful and distinct despite that reality.

## Core mission

Design and test several possible product shapes based on real customer workflows and evidence requirements. Then recommend the sharpest first product, its smallest responsible implementation, and a credible route to scale.

Do not assume that AI document extraction alone is differentiated. Do not assume that full automation is desirable before the team understands why claims are won or lost. Build the logic from customer value backward.

## Product questions to investigate

### 1. What is the exact job?

Find the narrowest useful job Reclaim could own. Potential directions include, but are not limited to:

- turning a remittance/deduction email into a prioritized, explained claim queue;
- matching a short-pay to invoices, POs, price agreements, and delivery proof;
- detecting one narrow claim type with unusually strong evidence;
- requesting missing documents from the right person;
- keeping a brand from missing a short dispute deadline;
- creating a trusted, ready-to-review evidence packet;
- guiding a founder through a customer-controlled submission;
- learning which deduction types are valid, invalid, or require a human review;
- identifying the operational cause so the next deduction does not happen.

Assess each idea against real user value, existing alternatives, trust, risk of errors, implementation difficulty, and ability to expand.

### 2. What would a first user actually do?

Write a realistic, detailed first-user journey. Do not write a generic UX wish list.

Describe:

- the exact moment the user discovers or receives a deduction;
- what files they have at that moment;
- how they safely get those files into Reclaim;
- what Reclaim reads or asks for;
- what it can conclude automatically and what it must label as uncertain;
- what the user sees, understands, approves, and submits;
- how the outcome is recorded;
- what makes them return next week or month.

The product should explain its reasoning. A founder cannot trust a black box telling them to challenge a distributor they depend on.

### 3. How should the product handle ambiguity?

Retail deductions are not all “yes/no” math. Research how a good product should separate:

- clearly supported claim;
- likely valid deduction;
- missing evidence / request more documents;
- disputed interpretation / human judgment needed;
- deadline expired;
- root cause to prevent next time.

Explore confidence scoring, evidence checklists, document traceability, human review, and user approval. Explain what should never be automated in the first product.

### 4. What does implementation really require?

Research concrete options for handling the documents and records expected in this workflow: PDFs, email attachments, invoices, remittance advice, CSVs, purchase orders, bills of lading, proof-of-delivery records, price sheets, and promotion agreements.

Be specific about:

- structured versus unstructured data;
- key fields and matching logic;
- OCR/extraction quality and common failure modes;
- document normalization and IDs;
- how to preserve the original document and show the source behind every conclusion;
- how humans could review/correct extraction errors;
- how the product can begin with user uploads and later move to email/ERP/EDI/portal integrations;
- what makes document matching hard when names, quantities, units, dates, SKUs, or invoice formats differ.

Do not lock the team into a particular stack unless evidence makes one clearly necessary. The goal is a phased product plan, not a fake enterprise architecture.

### 5. Trust, privacy, and safety

Research what a small company must do to earn enough trust for a brand to upload confidential operational and financial documents.

Consider document consent, least-privilege access, retention/deletion, redaction, audit logs, human access controls, clear explanations, correction flows, customer approval, data sharing with AI providers, and what should be avoided before the team has mature security and professional advice.

Be exact about the distinction between:

- accepting customer-uploaded documents;
- receiving forwarded remittance emails;
- connecting read-only systems;
- storing passwords or operating inside a portal;
- submitting claims under a customer’s name.

The product must not claim to be a legal representative, accountant, or authorized portal agent unless that is actually supported.

### 6. How does Reclaim become larger?

Map a credible path from one narrow workflow to a more valuable platform. Possibilities might include additional deduction types, distributor/retailer coverage, prevention insights, trade-spend reconciliation, workflow collaboration with brokers/3PLs/bookkeepers, outcome data, or a service-plus-software layer. Do not give a generic TAM story; explain what is naturally adjacent after the initial workflow works.

Also identify what makes the product easy for an incumbent to copy and what, if anything, can compound into a true advantage.

## Research standards

Use current sources: actual product documentation, API/partner terms, integration docs, accounting/ERP/EDI standards material, trustworthy security guidance, and official competitor product pages. Cite direct links. Treat unsupported AI claims and vendor ROI claims skeptically.

Clearly distinguish what can be established by research from what requires real document samples and customer tests.

## Deliverable

Write an extensive product and implementation report in plain language. Suggested structure:

1. The one job Reclaim should own first.
2. Product directions considered and why one wins.
3. A detailed first-user journey.
4. The evidence and decision model behind the product.
5. First prototype: exactly what it does and does not do.
6. Early-customer version: consent, review, security, and learning loop.
7. Later-scale version: integrations, partnerships, and operations.
8. Trust/safety constraints and dangerous shortcuts to avoid.
9. What a competitor already does, and the specific reason Reclaim would still matter.
10. A build order, manual validation plan, risks, sources, and confidence levels.

Use another structure if it makes the answer clearer. End with this kind of statement:

> **Version one of Reclaim should let [specific user] upload [specific records] and leave with [specific trustworthy output], while deliberately not attempting [specific risky/unproven action].**

State the evidence that would make you change the recommended product.
