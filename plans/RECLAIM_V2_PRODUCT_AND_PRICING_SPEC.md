Yes. I went much deeper on this than “what features should the dashboard have.” I looked at traditional recovery-audit firms, newer AP-control products, supplier-statement reconciliation products, QuickBooks/Xero data models, modern AP automation, how recovery firms actually pursue claims, and even user complaints around what happens after an overpayment is found.

The conclusion is stronger than where we started:

# Reclaim V2 should be a Recovery System, not an Audit Product

The audit is an engine inside Reclaim.

The actual product is:

> **Reclaim continuously finds money a business has lost or left stranded, determines whether that money is genuinely recoverable, builds the evidence, manages the recovery process, verifies the return of value, and helps prevent the same loss from happening again.**

That's a meaningfully different product from “we scan your books.”

And the market supports that distinction. Traditional recovery firms already move from identification through vendor confirmation and recovery; AP Impact, for example, describes a process of identifying a potential credit, confirming it with the supplier, obtaining backup, securing a refund/credit, and then reporting root causes. Modern software players are separately pushing toward continuous monitoring and supplier-statement reconciliation. ([AP Impact][1])

The opportunity for Reclaim is to combine those ideas into something dramatically simpler and more appropriate for a growing SMB/lower-mid-market finance team.

---

# 0. Operating principles: autonomous, private, and bounded

Reclaim is built for a very small team to support many customers without managing their accounts. That is not a reason to lower the product's ambition; it is a forcing function to build actual software automation rather than a software-enabled recovery service.

## Zero-Touch Operating Principle

> **No Reclaim founder or employee is part of a customer's normal financial or recovery workflow.**

Standard onboarding, connection, detection, verification, customer approval, vendor communication, follow-up, recovery verification, reconciliation guidance, billing, cancellation, and ordinary account administration must be self-service or automated. Reclaim personnel may help only with product failures, security or compliance events, and exceptional support—not to review, decide, or advance ordinary customer cases.

A workflow is not production-ready if a founder or employee must manually review or advance a normal customer case. The customer, not Reclaim, handles business-context ambiguity: subjective claims, disputes, legal situations, strategic relationship concerns, or uncertain entitlements pause the playbook and request customer review. Refunds and credits always go directly to the customer; Reclaim never takes custody of recovered funds.

Use this release gate for every feature:

> **If 1,000 customers used this tonight, would one of us need to wake up tomorrow and manually do something for them? If yes, the feature is not finished.**

Founder/admin tooling is therefore a system-health console—not a customer-operations console. It monitors sync and email failures, stuck workers, invalid state transitions, model failures, billing issues, and security events. It does not provide a routine queue for staff to operate customers' recoveries.

Test this as a product property, not a hope: run synthetic customer fleets through state-machine harnesses; cover happy paths and edge cases; and ensure every state has a defined automated transition, customer action, or safely terminal outcome. There must be no undefined state that requires manual database intervention.

The initial recovery surface should remain deliberately narrow, limited to categories that can be represented reliably as structured state machines: duplicate payments, overpayments, unused vendor credits, and paid duplicate obligations. Missing supplier credits follow later with supplier-statement reconciliation.

## Minimum Necessary AI Context

> **Audit locally / securely. Recover intelligently.**

This is a formal engineering principle alongside Zero-Touch. The financial truth layer is deterministic and privacy-first. Detection, matching, normalization, vendor identity resolution, credit aging, payment matching, invoice comparison, calculation, verification rules, and explicit workflow state logic are code and rules—not an LLM's judgment or arithmetic.

AI is most valuable after the system knows what a case is: reading and interpreting relevant documents and vendor replies, extracting structured facts, summarizing evidence, drafting outreach in an appropriate tone, classifying disputes, identifying missing information, and proposing bounded next steps. The audit side is heavily deterministic with limited AI assistance; the recovery side can use AI much more heavily, but only within deterministic playbook and state-machine guardrails.

AI must never receive unrestricted access to a customer's complete accounting dataset. Each operation is task-scoped and receives the smallest sufficient case packet. An initial-email drafting task needs only the vendor name/contact, invoice reference, verified amount, relevant dates, approved recovery method, and customer company identity. Reply classification needs the latest reply plus small case context. Document comparison needs only the relevant documents and fields.

Unrelated general-ledger entries, payroll, other vendors, bank transactions, revenue, balances, employees, and other accounting data are excluded unless genuinely required for that specific task. Redact or abstract sensitive fields whenever possible, including bank and routing numbers, tax IDs, employee personal data, home addresses, and unrelated balances.

## Four trust zones

1. **Customer Financial Data.** Raw QBO/Xero and other source records, documents, vendors, payments, credits, and bank-verification data are encrypted and are not directly browsable by AI.
2. **Reclaim Deterministic Financial Engine.** Reclaim's normalized model, matching, calculations, verification rules, workflow state, and Recovery Ledger establish financial truth.
3. **AI Context Gateway.** The only path by which AI can receive customer financial context. For the active, authorized task it permits an explicit field/document allowlist and removes everything else.
4. **AI Execution.** A model performs one bounded task and returns structured output. That output is validated before any consequential action.

The model should have no generic `get_any_customer_data()` capability. Prefer narrow, case-scoped tools such as `get_case_summary(case_id)`, `get_case_evidence(case_id)`, `get_latest_vendor_reply(case_id)`, `get_vendor_contact(case_id)`, and `get_refund_status(case_id)`. Prefer derived facts such as `refund_status` over a whole ledger or bank history. **AI interprets; code decides financial truth.**

AI responses should be structured interpretations—e.g. `vendor_acknowledged_issue`, `refund_amount`, `resolution_type`, `requires_followup`, and `dispute_detected`—rather than free-form commands. The deterministic state machine validates them and determines allowed transitions and next actions. Vendor communication may be automated only after customer approval and within an approved playbook; disputed, uncertain, subjective, or legal situations halt automation and request customer review.

Keep model data deliberate: retain durable business outcomes, source message/document references, model version, timestamp, confidence, and status rather than every large prompt by default. Put providers behind an internal `AIExecutionService`, with task-level operations such as `classify_vendor_reply()`, `summarize_evidence()`, `draft_recovery_message()`, and `extract_statement()`. This keeps privacy, cost, quality, and future approved/local-model choices flexible.

The customer-facing trust message is simple: **Reclaim does not send your entire accounting dataset to AI models. The secure financial engine handles accounting truth; AI gets only the minimum necessary context for one specific task.**

---

# 1. The fundamental product architecture

I would structure Reclaim around five core concepts:

**Discover → Verify → Recover → Reconcile → Prevent**

Not:

**Scan → show anomalies → dashboard**

Those sound superficially similar, but they're very different products.

### Discover

Reclaim continuously ingests financial information and finds situations in which money may belong back to the business.

### Verify

Reclaim determines whether the finding is actually recoverable rather than merely unusual.

### Recover

Reclaim manages whatever actions are necessary to obtain the money.

### Reconcile

Reclaim verifies that the value actually returned and correctly closes the accounting loop.

### Prevent

Reclaim identifies why it happened and eventually monitors for recurrence.

That final step matters. Current research on enterprise overpayments suggests that many losses originate outside AP itself—in cancellations, returned goods, pricing changes, fragmented systems, supplier data, and handoffs. A 2026 apexanalytix analysis of $3.25T of spend and more than 400M invoices reported duplicate payments, cancelled services/invoices, and pricing discrepancies among major sources of overpayments. ([Business Wire][2])

That tells us something strategically important:

**Recoveries are data about broken business processes.**

Eventually Reclaim isn't merely getting cash back. It's learning *why the business leaks cash*.

---

# 2. The centerpiece should be the Recovery Case

This is probably the most important product decision in this entire spec.

Do **not** make transactions the primary object.

Do **not** make alerts the primary object.

Do **not** make an AI assistant the primary object.

Make the **Recovery Case** the primary object.

Think of every case as a complete record of:

| Component         | Example                                      |
| ----------------- | -------------------------------------------- |
| Vendor            | Acme Industrial Supply                       |
| Opportunity       | Duplicate payment                            |
| Estimated value   | $4,820                                       |
| Verified value    | $4,820                                       |
| Why detected      | Same obligation paid twice                   |
| Evidence          | 2 bills, 2 payment records, invoice PDF      |
| Recovery method   | ACH refund                                   |
| Case status       | Awaiting vendor                              |
| Communications    | 3 emails                                     |
| Owner             | Customer-approved software playbook          |
| Next action       | Follow up Sep 21                             |
| Vendor response   | Acknowledged duplicate                       |
| Expected recovery | $4,820                                       |
| Actual recovery   | —                                            |
| Root cause        | Invoice entered twice with altered reference |
| Accounting status | Pending                                      |
| Audit trail       | Full activity history                        |

Everything in the product ultimately points back to a case.

This also fixes a weakness visible in existing tooling. One Xelix user specifically complained that different errors on a single invoice could appear as separate rows instead of being consolidated. Reclaim should do the opposite: **many signals may support one financial situation, but the user sees one coherent case.** ([G2][3])

---

# 3. Reclaim's financial truth model

This deserves almost obsessive attention because your pricing, dashboard, customer trust, contracts, analytics and success-fee disputes will eventually depend on it.

Do **not** treat all dollar amounts equally.

Reclaim should track different types of value separately.

| Value                    | Meaning                                                 |
| ------------------------ | ------------------------------------------------------- |
| **Potential**            | Something looks wrong                                   |
| **Verified Recoverable** | Evidence supports a legitimate recovery                 |
| **In Recovery**          | Recovery process has started                            |
| **Confirmed**            | Vendor/internal process agrees value is owed            |
| **Pending Return**       | Refund/credit is expected                               |
| **Recovered**            | Money/usable value has actually returned                |
| **Protected**            | Reclaim prevented money from leaving in the first place |

And these numbers never get blurred together.

Example:

> $86,400 Potential
> $51,200 Verified
> $37,800 In Recovery
> $19,600 Confirmed
> **$14,250 Recovered**

That is infinitely more trustworthy than:

> “Reclaim found you $86,400!”

### Particularly important rule

A vendor saying:

> “Yes, we owe you $5,000.”

is **not $5,000 recovered.**

A vendor issuing a $5,000 credit note is **not necessarily $5,000 recovered.**

It becomes recovered when either:

**Cash:** the $5,000 refund actually settles.

**Credit:** the $5,000 credit actually offsets a valid future liability.

Until then, it's something like **Confirmed Credit — Unapplied**.

Ramp itself distinguishes vendor credits from their eventual application to bills, and Xero's API similarly exposes credit notes and their allocations separately. ([Ramp Help Center][4])

This sounds like a detail now.

Later, this is the difference between trustworthy financial software and a SaaS company inflating “savings.”

---

# 4. The complete V2 workflow

Here is what I would actually design.

## Stage 0 — Onboarding

The first experience should be ridiculously simple.

### Connect your accounting system

Initially:

**QuickBooks Online**
**Xero**
**CSV/upload fallback**

Eventually:

NetSuite
Sage Intacct
BILL
Ramp
Brex
etc.

For an early U.S.-focused release, I would personally build **QuickBooks Online first** and normalize the entire product around one excellent integration before multiplying complexity.

Xero then becomes a strong second connector.

Technically, the data exists. Xero exposes purchase bills, payments, credit notes, overpayments, contacts, attachments and purchase orders through its Accounting API, with granular read scopes. QuickBooks exposes core entities including bills, vendor credits, bill payments, vendors and attachments. ([Xero Developer][5])

### Choose audit period

Something like:

**Last 12 months**
**Last 24 months**
**Last 36 months**

I'd probably make 24 months the normal starting point.

### Recovery preferences

The business establishes once:

Minimum amount worth pursuing
Cash refund vs vendor-credit preference
Excluded vendors
Strategic/vendor-sensitive relationships
Who must approve outreach
Who receives notifications
Whether Reclaim can send communications

Onboarding, connection management, permissions, billing, cancellation, and routine account administration must be completed by the customer in-product. Early adoption should be self-service/light-touch even for meaningful-spend QBO/Xero businesses; do not assume custom onboarding, human account management, or 24/7 manual recovery operations.

### Optional connections

Later in onboarding:

AP email inbox
Bank account verification
Document repository

But **don't make these requirements to see first value**.

The first mission is:

> Connect → Reclaim starts finding money.

---

# 5. Data normalization

This is the ugly engineering underneath the beautiful product.

Reclaim needs to create its own normalized financial graph.

Accounting systems differ, vendor names differ, invoice numbers differ, payments get split, credits get moved around.

Reclaim shouldn't reason directly on raw QBO/Xero records.

It should normalize them into its own objects:

```text
Organization
└── Vendors
    ├── Bills
    ├── Payments
    ├── Credits
    ├── Purchase Orders
    ├── Statements
    ├── Documents
    └── Communications
```

But underneath that is an even richer relationship graph:

```text
Vendor
 ↓
Obligation
 ↓
Invoice/Bill
 ↓
Payment(s)
 ↓
Adjustment/Credit
 ↓
Recovery Case
 ↓
Recovery Event
```

### Vendor normalization

This will matter enormously.

Reclaim needs to understand that:

**ABC Supply LLC**
**ABC Supply**
**A.B.C. Supply Inc.**
**ABC-SUPPLY-02**

might all be the same vendor.

Duplicate vendor records are a known source of duplicate-payment leakage, and modern AP products spend real effort normalizing vendor identity for exactly that reason. ([AutoPayables][6])

---

# 6. The detection engine

Here I would deliberately stay narrower than most AI founders would.

Do **four things extremely well first**.

## Detection 1 — Duplicate payments

Not just:

> invoice #18472 = invoice #18472.

That's already relatively easy to catch.

Reclaim needs:

Exact duplicate
Near duplicate
Cross-account duplicate
Cross-payment-method duplicate
Same vendor + amount + similar invoice reference
Invoice-number formatting differences
Duplicate vendor record
One invoice paid through two systems
Repeated partial/full payment combinations

AP.guru gives real-world examples of duplicate records slipping through because invoice numbers have leading zeros, extra characters, related vendor names, or entries across separate systems. ([AP Impact][7])

The algorithm should combine:

**Deterministic matching first**
+
**Fuzzy matching second**
+
**AI/document reasoning third**

Do not let an LLM perform core financial arithmetic.

LLMs should help interpret messy information.

The ledger math itself should remain deterministic.

---

# 7. Detection 2 — Unused vendor credits

This is more interesting than duplicates.

A vendor credit may already exist but simply sit unused.

Reclaim needs to identify:

Credit memo exists
Remaining balance > 0
Old enough to matter
Not allocated
Vendor may no longer be active
No expected application
Potentially forgotten

This is where recovery can happen **without contacting anyone.**

Very important concept:

## Internal recovery vs external recovery

Not every recovery needs vendor outreach.

### Internal Recovery

The company already owns the value.

Examples:

Unapplied vendor credit
Existing overpayment balance
Refund already received but unreconciled
Credit memo never matched
Existing supplier adjustment

Reclaim's job is to help properly use/account for it.

### External Recovery

Someone outside the business must act.

Examples:

Vendor needs to issue refund
Vendor needs to recognize duplicate payment
Vendor needs to issue credit
Contract billing dispute
Unreturned deposit

That split should be encoded directly in the product.

---

# 8. Detection 3 — Payment mismatches / overpayments

Reclaim identifies situations like:

Invoice = $7,500
Payments = $8,250

Potential recovery:

**$750**

But the engine must investigate first.

Maybe:

there were taxes,
there was another obligation,
the invoice changed,
currency moved,
the extra amount was prepayment,
a second payment belongs elsewhere.

That's why detection ≠ verification.

The engine raises the opportunity.

Verification proves it.

---

# 9. Detection 4 — Paid duplicate bills/invoices

This is subtly different from duplicate payment detection.

Two bills may represent the same obligation.

One might have:

INV-1092

and the other:

1092-A

The underlying documents may be practically identical.

If both eventually resulted in payments, that's a recovery opportunity.

If only one was paid?

That's **prevention**, not recovery.

And Reclaim should proudly say that instead.

> **$4,820 protected**

rather than pretending:

> **$4,820 recovered.**

---

# 10. Things I would NOT put in the initial detection engine

Not because they're bad.

Because they'll destroy focus.

I would postpone:

Contract-rate compliance
Freight auditing
Sales-tax errors
Volume rebates
Warranty recovery
Insurance recovery
SaaS cancellation detection
Telecom audits
Shipping credits
Employee expenses
Marketplace fees
Tax credits

There is substantial real-world leakage beyond duplicates—2026 enterprise research identifies cancelled services and pricing discrepancies as meaningful sources, for example. ([Supply & Demand Chain Executive][8])

But that's exactly why we shouldn't chase all of it immediately.

First prove:

> **We can find AP money and actually bring it back.**

Then widen the sources.

---

# 11. The Verification Engine

Once a signal exists, Reclaim investigates it automatically.

This is where V2 becomes much more sophisticated than your current audit.

Suppose Reclaim finds:

> **Potential duplicate: $4,820**

Verification should ask:

Do both records map to the same vendor?

Are they the same legal/vendor entity?

Do invoice references match or nearly match?

Do dates make sense?

Are the line items identical?

Were both transactions actually settled?

Was one reversed?

Was one a prepayment?

Was one already credited?

Could they represent separate legitimate purchases?

Has the issue already been resolved?

Is the money still outstanding?

### Then produce an Evidence Summary

Not:

> “AI confidence: 94%.”

That means nothing to a CFO.

Instead:

**Why Reclaim believes this is recoverable**

> Two payments totaling $9,640 reference invoice 1842 from Acme Supply.
>
> Payment #P932 — $4,820 — May 4
> Payment #P1051 — $4,820 — May 17
>
> Both map to the same $4,820 invoice.
>
> No reversal, refund, or vendor credit was found.
>
> **Likely recoverable: $4,820**

And underneath:

**View evidence**

Invoice
Payment 1
Payment 2
Ledger entries

That's explainability.

---

# 12. Evidence Strength, not fake AI confidence

Internally Reclaim can absolutely maintain probabilistic scores.

But initially I'd expose:

**Strong evidence**
**Moderate evidence**
**Needs review**

rather than random-looking percentages.

Underneath, score:

Amount certainty
Vendor-match certainty
Obligation-match certainty
Document support
Settlement verification
Existing-credit state
Data completeness
Recovery age

Then later, once you have enough outcomes to calibrate the model properly, you can expose a genuine recovery probability.

---

# 13. Opportunity Queue

This becomes one of the primary screens.

Not 500 alerts.

A prioritized list of money.

| Vendor         | Opportunity        |  Value | Evidence      | Action       |
| -------------- | ------------------ | -----: | ------------- | ------------ |
| Acme Supply    | Duplicate payment  | $4,820 | Strong        | Review       |
| Northstar LLC  | Unused credit      | $2,150 | Strong        | Apply credit |
| Orion Services | Overpayment        | $1,280 | Strong        | Recover      |
| Metro Freight  | Possible duplicate |   $940 | Review needed | Review       |

Sorting shouldn't merely use amount.

Internally I'd calculate something like:

**Recovery Priority = Expected Recoverable Value × Recoverability × Evidence Strength ÷ Expected Effort**

You might have:

$40,000 questionable case

versus

$18,000 slam-dunk duplicate.

The $18K case should potentially go first.

---

# 14. Convert Opportunity → Recovery Case

Once verification passes:

> **Start Recovery**

Now the opportunity becomes a formal case.

That is an important transition.

Potential anomalies shouldn't pollute the case-management system.

Only legitimate opportunities graduate.

---

# 15. Recovery Playbooks

This is another major architectural decision.

Don't make the AI invent the process from scratch every time.

Give Reclaim structured recovery playbooks.

## Duplicate payment playbook

Verify duplicate.

Determine amount.

Check whether vendor relationship is active.

Determine preferred resolution.

Assemble evidence.

Generate outreach.

Request refund/credit.

Track acknowledgement.

Track promised return.

Verify recovery.

Reconcile.

Close.

## Existing vendor credit playbook

Confirm credit validity.

Determine remaining amount.

Check upcoming invoices.

Recommend:

**Apply credit internally**

or

**Request cash refund**

Track application.

Verify next invoice reflects credit.

Close.

## Overpayment playbook

Compare actual obligation with amount paid.

Determine legitimate difference.

Generate evidence table.

Request acknowledgement.

Obtain refund/credit.

Verify.

Reconcile.

## Missing vendor credit playbook

This becomes extremely interesting once supplier statements arrive.

Compare supplier statement to customer's books.

Find a credit that exists on supplier side but not internally.

Request documentation.

Post/recognize credit.

Use/refund.

Close.

Playbooks create reliability. They are software-executed, deterministic state machines: AI may execute bounded communication and interpretation tasks, but it does not decide financial reality or invent a workflow.

---

# 16. Recovery method recommendation

Reclaim should recommend how to get value back.

Example:

> **Recommended: Cash refund**
>
> This vendor has had no activity for 11 months, so a vendor credit may remain unused.

versus:

> **Recommended: Apply credit**
>
> You average $14,000/month with this supplier and have another bill due in 12 days.

That's genuinely useful intelligence.

It also prevents the classic situation where businesses “recover” money into a vendor credit they never actually consume.

---

# 17. Recovery approval

For the initial product, I strongly recommend:

## Human approval before first vendor outreach

AP Impact explicitly says customers approve suppliers and communications before the audit firm pursues them. ([AP Impact][1])

That model makes sense for Reclaim too.

User sees:

> **Ready to recover $4,820 from Acme Supply**
>
> Reclaim will:
>
> Send recovery request
> Attach payment evidence
> Request refund by ACH
> Follow up after 5 business days

Then:

**Approve Recovery**

Later customers can configure:

Always approve
Auto-send under certain conditions
Auto-run trusted playbooks

But not day one.

---

# 18. Vendor communications

This is where a lot of the actual product value sits.

Reclaim shouldn't force vendors to create accounts.

Don't build some giant supplier portal.

**Email-native first.**

The supplier receives a professional message from the business/Reclaim-approved identity.

Their replies automatically attach to the case.

Reclaim reads the reply and classifies:

Accepted
Needs more documentation
Disputed
Already refunded
Credit issued
Wrong contact
Payment not found
Partial acceptance
Promised action
No action required

Then returns a structured interpretation for the state machine to validate and select the allowed next step. After customer approval, communications and follow-ups within a configured playbook can run automatically; disputes and ambiguous/subjective situations pause and request customer review.

Xelix is already moving toward AI that reads supplier inbox messages, performs ledger lookups and drafts responses. That's strong validation for communication becoming part of AP automation rather than a separate workflow. ([Xelix][9])

---

# 19. The Recovery Agent

Now we can introduce AI.

But the agent isn't:

> “Hi! What would you like to know?”

The **Recovery Agent works inside cases** through the AI Context Gateway, never by browsing a tenant's books.

It can autonomously:

Parse documents
Match references
Build evidence
Draft emails
Summarize supplier replies
Return structured status interpretation for the deterministic state machine
Recommend next steps
Schedule follow-ups
Detect missing documents
Surface contradictions
Generate reconciliation instructions
Write case summaries

And eventually:

Request supplier statements
Parse supplier statements
Perform reconciliations
Follow up for missing responses

But some things remain gated.

### Agent can do automatically

Read
Analyze
Organize
Draft
Match
Calculate using deterministic tools
Remind
Classify
Recommend

### Customer approval / configured policy required

Initial supplier outreach unless the customer has approved an Autopilot rule
Accept settlement
Change requested recovery amount
Apply financial credit
Write to accounting system
Close contested case

### Agent should never independently

Fabricate evidence
Threaten legal action
Accuse a supplier of fraud
Move money
Invent a contractual entitlement
Mark a promise as recovered
Hide conflicting evidence

That's the right flavor of agentic automation here.

---

# 20. Supplier statement reconciliation

This might eventually become one of Reclaim's strongest features.

Why?

Because your internal ledger only knows what **you know**.

Your supplier may have:

An unused credit
Return allowance
Rebate
Overpayment
Adjustment
Credit note

that isn't visible internally.

Supplier statement reconciliation lets Reclaim compare both realities.

Xelix's workflow is instructive: request supplier statements, remind suppliers, parse incoming statements, reconcile them against internal records, flag discrepancies, produce summaries, and preserve an audit trail. ([Xelix][10])

Traditional recovery auditors also rely heavily on supplier statements to discover credits that internal AP records alone don't reveal. ([AP Impact][1])

So eventually:

### Reclaim Statement Agent

Prioritizes vendors.

Requests statement.

Vendor replies with PDF/Excel.

Reclaim parses it.

Matches it against ledger.

Finds:

> **Vendor shows $8,240 credit not present in your books.**

Automatically creates an Opportunity.

That is extremely powerful.

---

# 21. Recovery Timeline

Every case should have a chronological timeline.

```text
SEP 12
Opportunity detected
Duplicate payment · $4,820

SEP 12
Evidence verified
4 supporting records matched

SEP 13
Recovery approved
Approved by Maya

SEP 13
Recovery request sent
Acme Supply · billing@...

SEP 15
Vendor replied
Duplicate confirmed

SEP 15
Refund promised
ACH · $4,820

SEP 18
Refund detected
Bank ending •2184

SEP 18
Recovery verified
$4,820

SEP 18
Accounting reconciled

CASE CLOSED
```

Imagine showing that to a finance manager.

Everything is obvious.

No spreadsheets.

No searching emails.

No mystery.

---

# 22. Recovery verification

This part makes Reclaim defensible.

You don't merely track claims.

You close the loop.

There should be multiple verification methods.

### Accounting verification

QBO/Xero now shows refund/credit/application.

### Bank verification

Optional connected bank detects a matching inflow.

Plaid's Transactions API, for example, exposes settled bank transactions and can continuously sync changes, which would make independent confirmation of refunds technically possible later. ([Plaid][11])

### Document verification

Vendor sent credit memo/refund confirmation.

### Manual verification

Customer confirms return and uploads support.

This is customer self-service confirmation, not a Reclaim staff review queue.

Best case:

**two-source confirmation**

> Supplier promised $4,820 → $4,820 bank credit appeared → matched.

Case closed.

---

# 23. Recovery Ledger

I'd create an internal **Recovery Ledger** separate from the accounting ledger.

This is Reclaim's source of truth.

Every dollar movement gets recorded:

| Event                | Amount |
| -------------------- | -----: |
| Potential identified | $4,820 |
| Verified             | $4,820 |
| Claimed              | $4,820 |
| Vendor acknowledged  | $4,820 |
| Refund committed     | $4,820 |
| Refund settled       | $4,820 |
| Recovered            | $4,820 |

Why?

Because this later powers:

Success fees
Customer invoices
Dispute resolution
ROI reporting
Analytics
Accounting
Audit history

And critically:

**attribution.**

Was this recovery caused by Reclaim?

Or did the company already know about it?

You'll need this answer once pricing is success-based.

So every case needs:

Discovery source
Discovery timestamp
Pre-existing known issue?
Customer disclosure
First Reclaim action
Recovery evidence
Recovery timestamp
Fee eligibility

Build this architecture now.

It will save enormous headaches later.

---

# 24. Reconciliation

Recovery shouldn't end when cash lands.

Reclaim needs to help restore accounting reality.

For example:

> Refund detected: $4,820
>
> Related recovery case: RC-1048
>
> Related vendor: Acme Supply
>
> Recommended accounting treatment:
> Clear vendor overpayment / apply against corresponding payable.
>
> **Mark reconciled**

Initially, give clear, self-service instructions and customer-controlled confirmation.

Later, support safe writeback.

This is especially important because real bookkeeping discussions show people commonly struggle with how to clear returned overpayments/vendor credits correctly in QuickBooks after the cash comes back. ([Reddit][12])

That's an underrated feature.

Reclaim doesn't just find the mistake.

It cleans up the whole mess.

---

# 25. Root cause analysis

Every successful or dismissed case teaches Reclaim something.

Possible root causes:

Invoice entered twice
Vendor duplicate record
Invoice renumbered
Payment issued across two systems
Payment retry
Employee manual entry
Vendor resent invoice
Credit memo never entered
Return not communicated to AP
Pricing updated incorrectly
Contract cancellation didn't reach finance
Accounting migration
Entity mismatch

Then the dashboard eventually says:

> **Why your business lost money this quarter**
>
> Duplicate invoice entry — $14,200
> Unused credits — $8,400
> Vendor master issues — $5,100
> Payment retries — $3,200

Now Reclaim starts moving from:

**Recovery product**

toward:

**Financial control intelligence.**

---

# 26. Prevention comes naturally after recovery

This is how I'd expand, not by abruptly pivoting again.

The exact same engine that scans historical transactions can eventually scan new ones.

When Reclaim sees something *before* payment:

> Possible duplicate bill
> $6,800
>
> **Payment not yet issued.**

Now:

**Protected $6,800**

That becomes another product surface.

So eventually the platform has:

### Recovered

Money that had already left and came back.

### Protected

Money Reclaim stopped from leaving.

### Available

Money already owned but stranded as credits/adjustments.

That's a killer financial model.

---

# 27. Core V2 navigation

I'd make the product surprisingly small.

### Overview

High-level recovery story.

### Opportunities

Money that might be recoverable.

### Recoveries

Verified cases currently being pursued.

### Vendors

Vendor-level financial/recovery history.

### Reports

Recovered money, root causes, performance.

### Data / Connections

QBO/Xero/uploads/etc.

### Settings

Approval rules, recovery preferences, team, exclusions.

That's it.

Don't drown this in 14 navigation tabs.

---

# 28. Overview dashboard

The dashboard should answer four questions immediately:

### How much money has Reclaim actually returned?

**$28,420 Recovered**

### How much is currently being recovered?

**$17,850 In Recovery**

### How much verified money is ready for action?

**$12,260 Ready**

### What should I do?

**3 approvals needed**

Then:

Recovery funnel
Recent recoveries
Largest opportunities
Case aging
Recovery by category
Recovery by vendor
Root causes

No abstract AI stats.

No nonsense graphs just because SaaS dashboards have graphs.

---

# 29. Case page

I would obsess over this page.

Header:

> **Acme Supply**
>
> Duplicate Payment
>
> **$4,820**
>
> In Recovery

Then perhaps four major sections:

### Summary

Why this is recoverable
Recommended action
Current status

### Evidence

Invoice
Payments
Credits
Documents
Computed differences

### Recovery

Vendor messages
Tasks
Next action
Recovery method

### Accounting

Refund/credit
Verification
Reconciliation
Root cause

And timeline to the side/bottom.

That could genuinely be the best page in the product.

---

# 30. Vendor page

A vendor should accumulate intelligence over time.

> **Acme Supply**
>
> $148,200 lifetime spend
> $8,920 recovered
> 3 recovery cases
> 2 unused credits discovered
> Average response: 2.4 days

Then:

Invoices
Payments
Credits
Cases
Documents
Contacts
Communications
Statement history

Eventually:

**Vendor recovery behavior**

Not a punitive risk score necessarily.

Just factual history.

---

# 31. Trust and UX rules

These are almost product laws.

### Reclaim should always show why

Never:

> Potential duplicate.

Always:

> Same vendor + same amount + highly similar invoice reference + both payments settled.

### Reclaim should admit uncertainty

> Missing source invoice. Review required.

is good software.

### Never inflate savings

Recovered ≠ identified.

Protected ≠ recovered.

Credit issued ≠ credit used.

### One financial situation = one case

Even if fifteen signals contributed.

### Every autonomous action is visible

Who
What
When
Why

### Everything is reversible until financial execution

Dismiss
Reopen
Correct
Reclassify

---

# 32. Dismissals are training data

If user says:

> Not duplicate — monthly recurring purchase.

Ask for one reason click:

Separate valid purchase
Already resolved
Credit already applied
Incorrect vendor match
Incorrect amount
Known exception
Other

That trains matching logic.

Over time:

> Don't flag identical $1,250 payments to XYZ every month because they're contractually recurring.

That's how the product genuinely learns the customer's business instead of merely saying “AI-powered.”

---

# 33. Security / control model

Initially:

**Read-only financial integration.**

That is what I'd ship.

No ability to move money.

No ability to alter books.

No ability to send external communication without approval.

You can later progressively authorize actions.

Also build from the beginning:

Role-based permissions
Tenant isolation
Encrypted credentials/tokens
Immutable audit events
Communication history
Data deletion/export
Connection revocation
Least-privilege OAuth scopes

Xero itself explicitly encourages apps to request the minimum scopes necessary, and its newer API model increasingly uses granular accounting scopes. ([Xero Developer][5])

This also makes selling much easier:

> Reclaim can't move your money.

---

# 34. Build the AI around tools, not vibes

A technically serious Reclaim agent should have narrow financial tools.

Something conceptually like:

```text
get_vendor()
get_bill()
get_payment()
get_credit()
get_vendor_history()
compare_transactions()
compare_documents()
calculate_payment_difference()
find_linked_transactions()
check_existing_recovery()
create_evidence_packet()
draft_vendor_message()
schedule_followup()
record_vendor_response()
verify_refund()
```

The model plans.

Tools provide truth.

Financial calculations stay deterministic.

This architecture matters enormously.

---

# 35. V2 feature scope I would actually commit to

If I were acting as product lead, I'd divide V2 into three internal releases.

## V2.0 — Recovery Core

This establishes whether the company works.

Must include:

Accounting integration
Normalized transaction model
Duplicate-payment detection
Paid duplicate-invoice detection
Overpayment detection
Unused-credit detection
Opportunities queue
Evidence view
Verification
Recovery Cases
Recovery approval
Email drafting/sending
Reply tracking
Automated follow-up workflow with customer review gates for exceptions
Recovery states
Recovery Ledger
Automated/ledger-based recovery verification plus customer self-service confirmation
Reconciliation workflow
Dashboard
Audit history

**If this works, Reclaim has a product.**

---

## V2.1 — Recovery Agent

Then automate bounded recovery work without adding Reclaim operational labor.

Supplier-reply classification
Automatic evidence collection
Automatic case summaries
Scheduled follow-ups
Recommended refund vs credit
Automatic next-action suggestions
Case prioritization
Accounting guidance
Improved vendor matching
Learning from dismissals
Case SLA/aging

Now Reclaim starts feeling magical.

---

## V2.2 — Recovery Network

Then broaden the information Reclaim can see.

AP inbox integration
Supplier statement requests
Statement parsing
Statement reconciliation
Missing-credit discovery
Bank refund verification
Document ingestion
Purchase-order matching
Root-cause analytics
Continuous monitoring

At this point Reclaim gets substantially harder to replace.

---

# 36. Then comes V3

This is where I would expand recovery types.

Not now.

Later:

Contract pricing discrepancies
Cancelled service charges
Returned-goods credits
Rebates
Volume discounts
Subscription leakage
Freight discrepancies
Tax errors
Service-level credits
Deposits/prepayments
Potential warranty claims

The beautiful thing is:

**the recovery infrastructure doesn't change.**

Every new detector still feeds:

> Opportunity → Verify → Case → Recover → Reconcile → Prevent

That's exactly what we want architecturally.

---

# 37. The moat is not the detector

This is another important conclusion from the research.

Basic duplicate detection is becoming table stakes.

Xero detects duplicate bills. Ramp checks duplicates. Brex flags potential duplicate payments. Specialized AP products do even more sophisticated matching. ([Xero][13])

So I would **not** build the company around:

> “Our AI detects duplicate payments better.”

You could eventually become excellent at that, but that is not enough.

The stronger moat is the accumulated **recovery intelligence**:

For every type of error:

What proves it?
What invalidates it?
What vendors accept?
What evidence gets responses?
How long does recovery take?
Refund or credit?
Which contacts respond?
What follow-ups work?
How should it be reconciled?
What caused it?
Did it recur?

Eventually Reclaim knows:

> **how businesses actually recover money.**

That's much more interesting.

---

# 38. The ideal early customer

I wouldn't target “every small business.”

The tiny café with 40 vendor transactions a month probably doesn't produce enough recoverable value.

The initial hypothesis I'd test is something closer to:

> **Growing SMB / lower-mid-market company with meaningful vendor spend, a lean finance team, QuickBooks/Xero, enough transaction volume for errors to occur, but without a dedicated recovery-audit operation.**

Think companies where:

The controller is overloaded.

There are maybe a few accounting/AP people.

Invoices come from email and multiple people.

Vendor spend is substantial.

The business has been around long enough to have historical data.

They are sophisticated enough to connect accounting software but too small to hire apexanalytix-level enterprise recovery infrastructure.

That is a much more interesting wedge.

And importantly, most of the visible sophisticated recovery/control products we looked at skew toward large organizations; Xelix reviews, for example, heavily feature mid-market and enterprise finance teams. ([G2][3])

There's room below that complexity level.

---

# 39. Metrics I would obsess over

Not MAUs.

Not number of scans.

Not “AI actions.”

### Product

**Time to first verified dollar**

How fast after connection does Reclaim show something believable?

### Detection

False positive rate
Verified opportunity rate
Dollar precision

### Recovery

Verified → recovery-start rate
Recovery success rate
Median days to recovery
Supplier response rate
Dollar recovery rate

### Automation

Customer minutes per recovery
Reclaim-human minutes per recovery (target: zero for normal cases)
% cases completed without manual Reclaim intervention
% drafts sent unchanged

### Trust

Wrong-claim rate
Recovered amount later reversed
Supplier complaint rate
Cases mistakenly marked recovered

I'd want those final three as close to zero as possible.

---

# 40. The north-star metric

Not:

**Money found.**

I'd use:

# Verified Dollars Recovered

Potential dollars can get inflated.

Savings can get inflated.

“Identified opportunities” can get inflated.

But:

> **$81,429 actually returned**

is brutally clear.

And eventually you can add:

> **$132,650 prevented from leaving**

separately.

That makes the product almost self-selling.

---

# 41. One subtle feature I think could become huge

## Recovery Autopilot

Eventually the company can choose:

**Manual**
Every external action requires approval.

**Guided**
Software handles routine steps but requests customer approval at financial/relationship decisions.

**Autopilot**
Approved playbooks run automatically under configured rules.

Example:

> Automatically pursue exact duplicate payments below $10,000 from non-strategic vendors, request cash refund, follow up every five business days, but require approval for disputes or settlements.

Recovery Autopilot explicitly means **software-executed recovery playbooks**, never a Reclaim employee service. Now the business isn't “using audit software.”

It's running a recovery operation without employing a recovery team.

That is where this gets really interesting.

---

# 42. Another feature I'd keep in the architecture from day one: vendor exclusions

A customer should be able to mark:

**Do not contact**

perhaps because:

Strategic supplier
Active legal dispute
Sensitive relationship
Parent/subsidiary relationship
Internal entity
Government entity
Already under audit

Detection can continue.

But recovery is blocked.

That prevents Reclaim from doing something technically correct but commercially stupid.

---

# 43. Economic thresholds

Not every $7 discrepancy deserves an investigation.

Each organization should eventually have:

> Minimum actionable recovery: $___

And Reclaim should automatically suppress/aggregate noise underneath it.

Potentially:

$18 + $22 + $31 in unrelated tiny discrepancies? Ignore.

Twenty-seven $38 overcharges from the same supplier caused by one recurring pricing mistake?

Now that's a **$1,026 case.**

Again:

**case-centric rather than alert-centric.**

---

# 44. The product needs a concept of “case economics”

For each recovery:

**Gross recoverable**
**Probability**
**Expected recovery**
**Estimated effort**
**Age**
**Vendor activity**
**Recovery method**
**Potential fee**

Internally this determines whether it's even worth pursuing.

A business doesn't want Reclaim spending three weeks recovering $43.

Neither do you.

---

# 45. How this connects directly to pricing

This research actually changed how I'd think about pricing.

A success fee only works cleanly if Reclaim can answer:

**What did we discover?**
**Was it genuinely recoverable?**
**Did we initiate recovery?**
**Did it actually return?**
**Did Reclaim cause the recovery?**
**Was it cash or credit?**
**Was the credit actually consumed?**
**How much was recovered?**

Which is why the **Recovery Ledger + attribution architecture belongs in V2**, even before we finalize pricing.

Then pricing becomes easy to implement rather than a Stripe hack.

Traditional recovery providers commonly use contingency pricing, while modern AP-control software often charges software fees instead. AP Impact uses contingency pricing; Novus publicly describes a fee around 19% of successful recovery; other market materials commonly describe contingency ranges around 20–30%. Those figures are useful references, but they're not automatically the right answer for Reclaim. ([AP Impact][1])

We'll model our own economics separately.

---

# 46. What I absolutely would not let Reclaim become

This is how we protect the idea from feature creep.

**Not another bill-pay product.**

Ramp/Brex/BILL/etc. already occupy that battlefield.

**Not another accounting platform.**

QuickBooks/Xero remain the accounting source of truth.

**Not a generic AI CFO chatbot.**

There are a million of those.

**Not a fraud-detection platform.**

Fraud may be surfaced, but accusing people of fraud creates a completely different product/risk profile.

**Not “upload anything and we'll find savings.”**

Too vague.

**Not fifty recovery categories on launch.**

You lose reliability.

Instead:

> **Reclaim owns the lifecycle of recoverable business money.**

That's focused enough to build and broad enough to become large.

---

# 47. The compounding product loop

This is the part I think is **three levels past “good.”**

Every completed case teaches four systems simultaneously.

### Detection gets smarter

What actually turned out to be an error?

### Verification gets smarter

Which evidence proved it?

### Recovery gets smarter

Which action brought it back?

### Prevention gets smarter

Why did it happen?

So after thousands of recoveries, Reclaim doesn't just have transaction data.

It has a dataset like:

```text
Signal
→ Evidence
→ Claim
→ Vendor response
→ Resolution
→ Money returned
→ Accounting treatment
→ Root cause
```

That is an extremely valuable proprietary dataset.

It tells you not merely what financial anomalies look like.

It tells you **what recoverable financial anomalies look like and how they resolve.**

That's a much better long-term intelligence advantage.

---

# The final V2 product

If I compress everything above into the product I would actually build:

> **Reclaim connects to a company's financial system and continuously searches historical and current AP data for recoverable money. Its secure deterministic financial engine combines related signals into clear opportunities, verifies them against underlying transactions and documents, and shows exactly why each one is recoverable. Verified opportunities become Recovery Cases. Customer-approved software playbooks build the evidence, recommend the best recovery method, prepare and conduct supplier outreach, track every response and follow-up, verify that cash or credits actually return, and provide self-service reconciliation guidance. AI is used only for bounded recovery tasks with minimum necessary case context; deterministic rules and the Recovery Ledger establish financial truth. Reclaim records the recovery in an auditable Recovery Ledger, determines the root cause, and monitors for the same loss in the future—without Reclaim personnel operating the customer's cases.**

And the customer experience becomes almost stupidly simple:

**Connect Reclaim.**

↓

**We found $18,420 worth reviewing.**

↓

**$13,870 is verified.**

↓

**Approve 3 recoveries.**

↓

Customer-approved software playbooks handle the work.

↓

**$11,920 returned.**

↓

**Here's what caused it and how we're watching for it now.**

That, to me, is the product.

The old **Ledger Audit System doesn't get deleted**. It effectively becomes Reclaim's **Discovery Engine**—one of the internal systems powering Recovery.

And that's a much, much stronger company than “AI scans your QuickBooks for duplicates.”

[1]: https://www.apimpact.com/audit?utm_source=chatgpt.com "AP Recovery Audit: Contingency Pricing | AP Impact"
[2]: https://www.businesswire.com/news/home/20260604272811/en/apexanalytix-2026-Global-Overpayment-Report-Reveals-Top-Five-Causes-of-Lost-Profit-in-Global-Enterprises?utm_source=chatgpt.com "apexanalytix 2026 Global Overpayment Report Reveals Top Five Causes of Lost Profit in Global Enterprises"
[3]: https://www.g2.com/products/xelix/reviews?qs=pros-and-cons&utm_source=chatgpt.com "Xelix Reviews 2025: Details, Pricing, & Features | G2"
[4]: https://support.ramp.com/vendor-credits-credit-memos-on-ramp-bill-pay?utm_source=chatgpt.com "Ramp Help Center"
[5]: https://developer.xero.com/documentation/guides/oauth2/scopes/?utm_source=chatgpt.com "Scopes — Xero Developer"
[6]: https://autopayables.com/accounts-payable-recovery-audit?utm_source=chatgpt.com "Accounts Payable Recovery Audit: Cost, Services, Software"
[7]: https://www.apimpact.com/ap-guru.html?utm_source=chatgpt.com "AP.guru: AI Accounts Payable Analytics Software | AP Impact"
[8]: https://www.sdcexec.com/sourcing-procurement/financial-management-software/news/22967818/apexanalytix-duplicate-payments-pricing-discrepancies-and-payments-of-cancelled-invoices-remain-top-causes-for-overpayment?utm_source=chatgpt.com "Duplicate Payments, Pricing Discrepancies and Payments of Cancelled Invoices Remain Top Causes for Overpayment | Supply & Demand Chain Executive"
[9]: https://xelix.com/resources/accounts-payable-solutions/turn-servicenow-into-an-ap-ready-helpdesk?utm_source=chatgpt.com "Turn ServiceNow into an AP-ready helpdesk with Xelix"
[10]: https://xelix.com/xelix-supplier-statement-reconciliation?utm_source=chatgpt.com "Automated Supplier Statement Reconciliation Software | Xelix"
[11]: https://plaid.com/docs/transactions/webhooks/?utm_source=chatgpt.com "Transactions - Transactions webhooks | Plaid Docs"
[12]: https://www.reddit.com/r/Bookkeeping/comments/1p481e2/how_to_delete_vendor_credit_we_overpaid/?utm_source=chatgpt.com "how to delete vendor credit we overpaid"
[13]: https://www.xero.com/us/accounting-software/pay-bills/?utm_source=chatgpt.com "Pay Bills on Time With Xero Accounts Payable Software | Xero US"

