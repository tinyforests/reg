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

The default is Provisional / Self-reported, with no awarded badges. Only after
independent evidence review, choose `--verification third_party_verified` or
`--verification gardener_and_son_verified` and supply `--verifier` explicitly.
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
