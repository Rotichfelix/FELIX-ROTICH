# Firebase Security Specification & Hardening Spec (Lomuriangole Attendance)

## 1. Data Invariants
- A user can only access, view, upload, sync, or configure their own personal database of cohort participants, workshops, and school registers.
- All documents inside `/users/{userId}/data/metrics` must conform exactly to the standardized schema structure, preventing any shadow custom fields.
- The user ID extracted from the auth state MUST match the target path parameters exactly to block any ID spoofing or horizontal privilege escalation.

## 2. The "Dirty Dozen" Threat Payloads (Test Proofing)

| Case | Attacker Payload Description | Intended Behavior | Rules Guard |
|---|---|---|---|
| D1 | Authenticated User A tries to edit User B's `/users/B/data/metrics` document. | `PERMISSION_DENIED` | `isOwner(userId)` constraint |
| D2 | Unauthenticated attacker attempts reading any metrics snapshot. | `PERMISSION_DENIED` | `isSignedIn()` constraint |
| D3 | Authenticated owner sends a payload with shadow field `isAdmin: true` injected. | `PERMISSION_DENIED` | Schema verification `isValidUserDbState(incoming())` |
| D4 | User attempts to save metrics array exceeding strict memory boundary limits.| `PERMISSION_DENIED` | Size guards on payload fields |
| D5 | Attacker targets userId using a malicious string containing directory traversals `../`. | `PERMISSION_DENIED` | `isValidId(userId)` validation |
| D6 | User tries to pass `lastUpdated` as an array or map instead of timestamp string. | `PERMISSION_DENIED` | `incoming().lastUpdated is string` guard |
| D7 | Attacker tries to insert custom parameters inside nested fields that bypass mapping. | `PERMISSION_DENIED` | Strict type validation on root keys |
| D8 | User sets `participants` field to an arbitrary non-array object. | `PERMISSION_DENIED` | `data.participants is list` guard |
| D9 | User sets `sessions` field to a boolean inside the state document. | `PERMISSION_DENIED` | `data.sessions is list` guard |
| D10 | User sets `attendance` to an array instead of structured dictionary maps. | `PERMISSION_DENIED` | `data.attendance is map` guard |
| D11 | User attempts to delete they do not own. | `PERMISSION_DENIED` | `isOwner(userId)` on DELETE |
| D12 | Attacker sends `get` target for non-existent userId hoping for field leakage. | `PERMISSION_DENIED` | `isOwner(userId)` blocks retrieval |

## 3. High-Security Firestore Rules Blueprint
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function isValidUserDbState(data) {
      return data.keys().hasAll(['participants', 'sessions', 'attendance', 'lastUpdated'])
        && data.keys().size() == 4
        && data.participants is list
        && data.sessions is list
        && data.attendance is map
        && data.lastUpdated is string
        && data.lastUpdated.size() <= 128;
    }

    match /users/{userId}/data/metrics {
      allow read: if isOwner(userId) && isValidId(userId);
      allow create: if isOwner(userId) && isValidId(userId) && isValidUserDbState(incoming());
      allow update: if isOwner(userId) && isValidId(userId) && isValidUserDbState(incoming());
      allow delete: if isOwner(userId) && isValidId(userId);
    }
  }
}
```
