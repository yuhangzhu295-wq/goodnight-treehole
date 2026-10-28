# C-end identity credential storage

**Status:** implemented, with one gap stated below.

## What is stored

One session credential per install: `<sessionId>.<secret>`, issued by
`POST /api/v1/auth/anonymous` and bound to a server-chosen user id. The server stores only
`sha256(secret)`, so a database read cannot be replayed as a credential.

## Where it is stored

| Platform | Mechanism | App-private? | Hardware-backed? |
| --- | --- | --- | --- |
| Android / iOS (Capacitor native) | `@capacitor/preferences` → Android `SharedPreferences`, iOS `UserDefaults` | yes | **no** |
| Browser (H5 build) | `localStorage` | same-origin only | no |

Native storage is deliberately not `localStorage`: on a device that is app-private storage which
other applications cannot read, and it is not part of a web origin that any injected script shares.

## What this protects against, and what it does not

Protects against:

- another application on the device reading the credential;
- a web page of another origin reading it;
- the credential being reconstructed from the server's database.

Does **not** protect against:

- a rooted or jailbroken device, or a device-level compromise that can read the app's data
  directory;
- an attacker who can execute code inside this app's own process;
- forensic extraction of an unencrypted backup that includes `SharedPreferences`.

**Gap, stated plainly:** `@capacitor/preferences` is app-private but **not** encrypted with the
platform keystore. Closing that would mean a keystore-backed plugin (Android Keystore / iOS Keychain)
instead of Preferences. That is a dependency and native-code change, and it is not done here. Until
it is, the protection is "app-private", not "hardware-backed", and the 30-day TTL plus server-side
revocation (`POST /api/v1/auth/logout`, `POST /api/v1/auth/revoke-device`) is what limits the damage
from a compromised device rather than the storage itself.

## Related

- Revocation and rotation: `apps/api/src/anonymous-session.service.ts`
- Why the header is not a user id: `docs/architecture/SELF_ROUTE_IDENTITY_MATRIX.md`
