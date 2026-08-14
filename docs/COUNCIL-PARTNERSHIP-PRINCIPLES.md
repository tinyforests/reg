# Council Partnership Principles

**Version 1.0 — 14 August 2026**
**Status: active. Committed in writing to Whitehorse City Council, 14 August 2026.**

These are binding commitments, not aspirations. They were written in response to two
concerns raised by Whitehorse City Council officers on 12 August 2026 — privacy, and
potential conflict of interest — and have been communicated to Council in writing.

Any council partnership from here uses these principles unchanged. If a change is
needed, version this document and record what changed and why. Do not quietly diverge.

---

## 1. The governing rule

**Council never transfers resident information to the Registry. The resident decides
for themselves.**

Everything below follows from this. If a proposed mechanism requires a council to hand
over information about an identifiable household, the mechanism is wrong — find another
one.

---

## 2. Two streams, permanently separate

Council data and individual garden records travel on separate paths. They never join.

### Stream 1 — Council measurement

- Council may share aggregate, de-identified ecological information for a municipal
  picture: species frequencies, habitat structure counts, totals by locality.
- This data is **permanently** de-identified. No garden profile is created from it.
  No claim code is issued against it. It cannot be reversed back to a household.
- If a record can later be reattached to a property, it was never de-identified.
  Pseudonymous identifiers with a claim mechanism do not satisfy this principle and
  must not be described to a council as de-identified.

### Stream 2 — Individual garden records

- Council sends an invitation to its own program participants. The participant list
  stays with Council. The Registry never receives it, holds it, or asks for it.
- The steward comes to the Registry themselves and provides their own assessment
  report directly.
- The Registry does not pre-build a household record and wait for it to be claimed.
  Consent comes from the steward at the point of registration, never inferred.

---

## 3. Public display

Shipped as of 14 August 2026 across all profiles:

- No steward name on the public record.
- No precise address. Locality plus Registry ID only.
- Map pins offset from the property (deterministic, ~250m) to preserve neighbourhood
  context without revealing the house.
- Steward controls their own record: name, photographs and story are consent settings,
  not defaults.
- Ecological history belongs to the garden and persists across a change of ownership.
  Personal information does not.

**Open item blocking a full claim of compliance:** precise coordinates currently remain
in public JSON. Until they are moved to a private store, the protection is
presentational. Do not describe the display protections as complete to a council until
this is closed.

---

## 4. Commercial separation

Gardener & Son operates the Registry and is also a commercial design studio. That is
stated plainly to councils rather than left implicit.

For any council pilot pathway:

- No design services marketed or solicited to any steward who joins through that
  pathway.
- If a steward asks for design help during the pilot, refer them elsewhere.
- Steward-facing pilot materials carry Registry branding, not Gardener & Son's.
- Participant information is used solely for Registry purposes.
- Registry inclusion is not contingent on Gardener & Son involvement — Canterbury and
  Lorimer are the standing evidence.

**Governance:** ask each council what conflict-of-interest, partnership or probity
process they would like the Registry to work through. Let the council set the standard
rather than asking them to accept our assurances.

**Trigger for review:** at council two and three, revisit whether the Registry should be
structurally separated from Gardener & Son. Not required for a small pilot; increasingly
required as the ledger's authority depends on looking independent of any one studio.

---

## 5. Evidence labelling

A council supplying an assessment is **not** a council verifying a Registry score.
These are different claims and must never be conflated.

- Where a record is built from a council program report, the council is recorded as the
  **source of third-party evidence**.
- Council assessors are named as third-party assessors for the council's own program.
- The `verifier` field is populated only where verification was performed *for the
  Registry*, against the Registry method.
- Never apply a "verified by [Council]" marker on the strength of a council program
  report. A council discovering an unearned endorsement of itself is the fastest
  available way to lose the relationship.

Steward consent to publish their record does not extend to claims about a council.
Those are separate permissions from separate parties.

---

## 6. What a council can be told, plainly

Answers to the three questions a council officer will be asked internally:

**"Did we give a private company our residents' data?"**
No. Council sent an invitation. Residents chose for themselves.

**"Will residents' addresses end up online?"**
No. Public records show a locality and an offset pin, and each steward controls their
own record.

**"Why did we point residents at a garden design company's platform?"**
Because they committed in writing not to sell design work to anyone arriving through
our program, and asked to be put through our own probity process.

---

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 14 Aug 2026 | Initial. Written from the Whitehorse engagement; committed to Council in writing. |
