## Client Migration

Different from **INTAKE**, new clients coming onboard the practice, **MIGRATION** is about getting existing clients into the application.

### Migration Goals

Help the practitioner:

- Connect calendar(s)
- Discover existing clients
- Create client records
- Link historical appointments

The goal is not to collect clinical information. The goal is to reconstruct the practitioner's existing practice with the least amount of manual work. The practitioner should feel:

> "I connected my calendar and my practice appeared."

---

## Migration Steps

### Step 1: Connect Calendar

**User connects:**

- Google Calendar
- Outlook
- Apple Calendar (if supported)

**Import:**

- Calendars
- Events
- Attendees

### Step 2: Analyze Events

**System scans a configurable window.**

Example:

- Past 6 months
- Next 3 months

Extract:

- Event title
- Attendees
- Organizer
- Date/time
- Recurrence patterns

### Step 3: Identify Potential Clients

**Build candidate list.**

Example:

| Candidate                               | Evidence        |
| --------------------------------------- | --------------- |
| [john@gmail.com](mailto:john@gmail.com) | 42 appointments |
| [sara@gmail.com](mailto:sara@gmail.com) | 18 appointments |
| [alex@gmail.com](mailto:alex@gmail.com) | 9 appointments  |

### Step 4: Client Discovery Screen

**Present Likely Clients:**

Example:

```
✓ John Smith
- 42 sessions
- Last session 3 days ago

✓ Sara Khan
- 18 sessions
- Last session 1 week ago
```

**Needs Review:**

```
? Family Session
? Intake Appointment
? Consultation
```

**User can:**

```
- Confirm
- Merge
- Ignore
```

### Step 5: Deduplication

**Calendars are messy**

Examples:

```
John
John S.
john@gmail.com
```

Suggest:

- These may be the same client.
- User confirms.

### Step 6: Create Client Records

**Generate:**

```
Client:
- Name
- Email

Record Status:
- Migrated

Client Status:
- Active
```

> Note: A client coming via Intake would have record status "Onboarded"
---
