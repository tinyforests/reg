# Invited designer pilot

The live entry points are `/designer-invite.html` and `/designer-dashboard.html`.
This pilot supports invited practice access, private garden submissions, revisions,
a Registry review queue and public portfolios drawn from canonical attribution.
There are no simulated gardens, automatic verification, invitation emails or payments.

## Invite a practice

Open the portal, expand Registry administration and enter the existing backend admin
token. This is real server authentication; `er_admin=1` does not grant access.
Create a practice with its name and contact email. For an existing attributed practice,
use its canonical `designer_id` to connect existing records. Otherwise leave ID blank.
Copy the returned private link and share it personally. Treat it as a credential.
Only its SHA-256 hash is stored in the private `Designer Practices` sheet.
Practices may also request a one-use, 30-minute link by contact email from the
portal. Verification consumes the link under a script lock and issues a hashed
180-day session, matching steward access. Sessions remain in this browser tab
only and Lock portal clears them. Revocation or link rotation expires sessions
and outstanding email links. Invalid or expired links leave the public view.
Reissuing the link invalidates the old one; revocation disables practice access.
The URL fragment is removed as soon as the portal opens; credentials are retained
only in this tab's session storage until Lock portal is used.

## Submit and review

Designers submit measured ecological inputs and a species list, with explicit
steward permission and public-profile consent. Unknown optional measurements are
null. Address, steward email, evidence URL and reviewer notes are private. Submissions
are stored in `Designer Submissions`, never the public enrolment CSV or repository.
The server fixes practice attribution and the provisional/self-reported status.
The admin review queue allows pending, changes requested and ready statuses.
Ready means reviewed for publication, not independently verified.

## Publish a reviewed garden

Use the repository tool with `ER_ADMIN_TOKEN` already set securely in the environment.
Do not pass credentials in command arguments, source files, screenshots or chat.

```sh
python3 scripts/promote_designer_submission.py DSG-<submission-id> --check
python3 scripts/promote_designer_submission.py DSG-<submission-id>
```

The default is Provisional / Self-reported, with no awarded badges. The helper
requires `--verifier` for a verified option, but that flag alone does not establish
independence. Only use `gardener_and_son_verified` when that actual assessment was
performed. **Do not use `third_party_verified` as a recognised verification tier:**
the helper accepts it but the current scoring engines do not recognise it. Resolve
the mismatch described in [pending-work.md](pending-work.md) before third-party
verified publication.
The garden receives a deterministic neutral ID and URL. Review the generated
canonical JSON, profile and registry entry together; deploy all three through the
normal repository workflow. Existing garden files are never overwritten.
After Pages serves the record:

```sh
python3 scripts/promote_designer_submission.py DSG-<submission-id> --confirm-live
```

The backend checks the live garden ID and designer attribution before marking it
published and linking its address to private `Garden Addresses` and email to
`Steward Emails`. Retry confirmation safely; it does not duplicate private linkage.
Stewards can then use the existing email claim flow for their garden.
No exact coordinates are supplied or guessed in this pilot. Resolve ecological
context and private coordinates through the normal reviewed workflow if required.

## Validation

```sh
node scripts/test_designer_portal.cjs
python3 scripts/test_designer_publication.py
```

These use fake private sheets and fixtures only. They check unauthorised access,
practice isolation, consent, measured-input limits, idempotency, verification,
review states, revocation and publication linkage. The Python test also checks
public-file privacy, neutral URLs and scoring against the canonical engine.

Yield remains in the canonical schema and concept pages. Profile rendering stays
hidden and payments remain inactive.


## Public portfolio and email access — Phase 2

Without credentials, the portal reads the public practice directory, derived
verified-only totals and canonical garden data. Practice selection links to a
public approximate corridor map. Provisional and Design Proposal cards remain
quarantined, without a verified score. The original illustrative dashboard is
archived at `/archive/designer-dashboard-concept.html`, clearly marked as a concept.
Existing invited private submissions and admin review remain available.

Profile-service Apps Script deployment updated to version 38 on 15 Oct 2026.
Deployment ID and `/exec` URL remain `AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC`.
The separate newsletter deployment remains unchanged. New private sheets are
`Designer Access Tokens` (hashed token, practice ID, creation, expiry, used)
and `Designer Sessions` (hashed token, practice ID, creation, expiry).
No practice contact email or credential is written to public JSON.

## Upgrade routing — Phase 3 merged; Apps Script deployment pending

Garden profiles offer “Get help with this upgrade” on physical ecological moves.
The steward must unlock their garden using the existing email session and consent
to that individual request, including original-designer priority, 14 days to respond
and G&S fallback. A click is an enquiry, not a completion claim or score change.

Designer queue: accept or decline an offer. Before acceptance, no steward contact
is returned. G&S/admin receive released requests. Only admin can confirm completion;
verified ecological inputs still follow the existing review/sync process. Every
transition is timestamped in private Routing History. Notifications contain no
precise location. No live request or notification was sent during fixture testing.

Phase 3 merged to main on 15 Oct 2026. All seven release test commands pass;
25 garden scores are unchanged. Apps Script deployment remains pending: the last
recorded profile-service deployment is version 38; the next version is 39 (confirm
in Manage deployments if another version has since been created). No backend
deployment or Google authorization was performed for this release.

### Apps Script editor release checklist

1. Deploy the current `scripts/appsscript/Code.gs` as a new version on the existing
   profile-service deployment. Keep the same deployment ID and `/exec` URL above.
2. Run `installRoutingReleaseTrigger` once and approve the MailApp and ScriptApp
   scopes. Confirm one `releaseExpiredRouting` time trigger exists (every 15 minutes).
3. Confirm `ROUTING_RESPONSE_MINUTES` is **not set** in Script Properties. It is the
   one-minute test override; production uses the default 14-day response window.
4. Confirm `sam-cox-landscape` and `gardener-and-son` are both `active` in the
   private Designer Practices sheet.

Phase 4 is not merged. It remains gated on the real private aggregate import and
other publication gates in [designer-demand.md](designer-demand.md). Public
frontend publication does not establish that the new backend routing is active.
