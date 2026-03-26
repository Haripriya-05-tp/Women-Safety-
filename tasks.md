# Implementation Plan: Women Safety Alert

## Overview

Implement the entire app as a single `index.html` file with inline CSS and JavaScript. All modules (`AuthService`, `ContactManager`, `LocationService`, `AlertService`, `AlarmService`, `Router`) live inside one `<script type="module">` block. A companion `index.test.js` file holds unit and property-based tests.

## Tasks

- [x] 1. Scaffold index.html — structure, CDN imports, CSS, screen skeletons
  - Create `index.html` with Firebase CDN `<script type="module">` imports (Auth, Firestore, App)
  - Add CSS reset, CSS variables for colors, and layout styles for all four screens
  - Add HTML skeletons for `#screen-auth`, `#screen-home`, `#screen-contacts`, `#screen-settings` — all hidden by default except auth
  - Embed placeholder Firebase config object (keys to be filled in by user)
  - _Requirements: 1.7, 3.1_

- [x] 2. Implement Router
  - [x] 2.1 Write `Router.navigate(screen)` inside the module script
    - Toggle `display` on each screen div; update active nav icon state
    - _Requirements: 1.5, 2.6_

- [x] 3. Implement AuthService and Auth screen UI
  - [x] 3.1 Write `AuthService` — `registerWithEmail`, `loginWithEmail`, `registerWithPhone`, `confirmOTP`, `logout`, `currentUser`, `onAuthStateChanged`
    - Use Firebase Auth SDK methods; wrap in try/catch; surface errors as thrown strings
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 3.2 Wire Auth screen HTML — email/password form, phone OTP form, tab switcher, error `<p>` element
    - On submit: call `AuthService`; on success call `Router.navigate('home')`; on error show generic message (never reveal which field failed)
    - On `onAuthStateChanged` with user → `Router.navigate('home')`; without user → `Router.navigate('auth')`
    - _Requirements: 1.4, 1.5, 1.6, 1.7_
  - [ ]* 3.3 Write property test for AuthService — P1: valid credentials resolve with uid
    - `// Feature: women-safety-alert, Property 1: valid credentials produce a user account`
    - Mock Firebase `createUserWithEmailAndPassword`; use `fc.emailAddress()` × `fc.string({minLength:6})`
    - **Validates: Requirements 1.1, 1.3**
  - [ ]* 3.4 Write property test for AuthService — P2: invalid credentials reject with non-empty error
    - `// Feature: women-safety-alert, Property 2: invalid credentials produce an error message`
    - Use `fc.string()` for malformed emails; assert error message is non-empty string
    - **Validates: Requirements 1.4**
  - [ ]* 3.5 Write property test for AuthService — P3: register then login round-trip yields same uid
    - `// Feature: women-safety-alert, Property 3: register then login round-trip`
    - Mock register + login; assert both resolved `uid` values are equal
    - **Validates: Requirements 1.5**

- [x] 4. Implement ContactManager and Contacts screen UI
  - [x] 4.1 Write `ContactManager` — `getContacts(uid)`, `addContact(uid, contact)`, `deleteContact(uid, contactId)`
    - `addContact` throws `"Maximum 3 contacts allowed"` when list already has 3 entries
    - Validate E.164 phone format via `isValidPhone(phone)` before any Firestore write
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_
  - [x] 4.2 Wire Contacts screen HTML — contact list `<ul>`, add-contact form (name + phone inputs), inline error `<p>`, delete buttons
    - On load: call `ContactManager.getContacts` and render list
    - On add: validate → call `addContact` → re-render; show limit message when at 3
    - On delete: call `deleteContact` → re-render
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_
  - [ ]* 4.3 Write property test for ContactManager — P4: add contact round-trip
    - `// Feature: women-safety-alert, Property 4: add contact round-trip`
    - Use `fc.record({name: fc.string({minLength:1,maxLength:50}), phone: fc.constant('+919876543210')})`
    - **Validates: Requirements 2.1, 2.5**
  - [ ]* 4.4 Write property test for ContactManager — P5: contact list never exceeds 3
    - `// Feature: women-safety-alert, Property 5: contact list never exceeds 3`
    - Use `fc.array(validContact, {maxLength:10})`; assert `contacts.length <= 3` always
    - **Validates: Requirements 2.2, 2.3**
  - [ ]* 4.5 Write property test for ContactManager — P6: delete contact removes it
    - `// Feature: women-safety-alert, Property 6: delete contact removes it`
    - Use `fc.array(validContact, {minLength:1, maxLength:3})`; delete one; assert not in result
    - **Validates: Requirements 2.4**
  - [ ]* 4.6 Write property test for ContactManager — P7: contacts screen DOM matches Firestore data
    - `// Feature: women-safety-alert, Property 7: contacts screen displays all saved contacts`
    - Use `fc.array(validContact, {maxLength:3})`; render to JSDOM; assert all names/phones present
    - **Validates: Requirements 2.6**
  - [ ]* 4.7 Write property test for isValidPhone — P8: invalid phone numbers rejected
    - `// Feature: women-safety-alert, Property 8: invalid phone numbers are rejected`
    - Use `fc.string()` filtered to non-E.164 strings; assert `isValidPhone` returns `false`
    - **Validates: Requirements 2.7**

- [ ] 5. Checkpoint — ensure auth and contacts logic is wired and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement LocationService
  - [x] 6.1 Write `LocationService` — `requestPermission()`, `getCurrentLocation()`
    - Wrap `navigator.geolocation.getCurrentPosition` with 10 s timeout option
    - Return `{status:'ok', lat, lng, mapsUrl}` on success; `{status:'denied'}` or `{status:'timeout'}` on failure
    - `mapsUrl` format: `https://maps.google.com/?q={lat},{lng}`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.2 Write property test for LocationService — P11: maps URL format for any coordinates
    - `// Feature: women-safety-alert, Property 11: maps URL format for any coordinates`
    - Use `fc.float({min:-90,max:90})` × `fc.float({min:-180,max:180})`; assert URL matches `https://maps.google.com/?q=`
    - **Validates: Requirements 4.2**

- [x] 7. Implement AlertService
  - [x] 7.1 Write `AlertService.sendSOS(uid)`
    - Fetch contacts via `ContactManager.getContacts`; if empty show "no contacts" modal and return early
    - Call `LocationService.getCurrentLocation()`; compose message using SMS template
    - Open `sms:?body=...&addresses=...` URI intent; if `sms:` not supported (desktop) show copyable pre-filled message
    - Return `{sent: string[], failed: string[]}`
    - If alarm enabled (`state.alarmEnabled`), call `AlarmService.start()`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 5.1_
  - [ ]* 7.2 Write property test for AlertService — P9: SOS sends correctly formatted messages to all contacts
    - `// Feature: women-safety-alert, Property 9: SOS sends correctly formatted messages to all contacts`
    - Use `fc.array(validContact, {minLength:1})` × `fc.option(coords)`; assert message body contains danger text and maps URL or fallback
    - **Validates: Requirements 3.2, 3.3, 3.5**
  - [ ]* 7.3 Write property test for AlertService — P10: failed contacts reported by name
    - `// Feature: women-safety-alert, Property 10: failed contacts are reported by name`
    - Use `fc.array(validContact)` × `fc.subarray(contacts)` as failed set; assert `SOSResult.failed` names match exactly
    - **Validates: Requirements 3.6**

- [x] 8. Implement AlarmService
  - [x] 8.1 Write `AlarmService` — `start()`, `stop()`, `isPlaying()`
    - Use Web Audio API (`AudioContext`, `OscillatorNode`) to generate a 880 Hz tone at max gain
    - Guard with `try/catch`; if `AudioContext` unavailable set a flag to silently disable alarm
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 8.2 Write property test for AlarmService — P12: alarm toggle is a round-trip
    - `// Feature: women-safety-alert, Property 12: alarm toggle is a round-trip`
    - Use `fc.boolean()` as initial state; toggle twice; assert `localStorage` key `wsa_alarm_enabled` matches original value
    - **Validates: Requirements 5.4**

- [x] 9. Implement Home screen and Settings screen UI
  - [x] 9.1 Wire Home screen HTML — large red SOS button, alarm stop button (hidden by default), bottom nav icons (contacts, settings)
    - SOS button `onclick`: call `AlertService.sendSOS`; show confirmation banner on success; show failed-contacts list if `result.failed.length > 0`
    - Stop button `onclick`: call `AlarmService.stop()`; hide stop button
    - Show stop button whenever `AlarmService.isPlaying()` is true
    - _Requirements: 3.1, 3.4, 3.6, 3.7, 5.2, 5.3_
  - [x] 9.2 Wire Settings screen HTML — alarm enable/disable toggle, sign-out button
    - Toggle reads/writes `state.alarmEnabled` and `localStorage` key `wsa_alarm_enabled`
    - Hide alarm toggle if `AudioContext` is unavailable
    - Sign-out calls `AuthService.logout()` then `Router.navigate('auth')`
    - _Requirements: 5.4_

- [ ] 10. Checkpoint — full integration pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire everything together and handle edge cases
  - [x] 11.1 Initialize app on `DOMContentLoaded` — call `onAuthStateChanged`, restore `alarmEnabled` from `localStorage`, call `Router.navigate`
    - _Requirements: 1.7, 5.4_
  - [x] 11.2 Add offline banner — listen to `window.online`/`offline` events; show "Offline — contacts may be outdated" banner when offline
    - _Requirements: 2.6_
  - [x] 11.3 Write unit tests in `index.test.js` for concrete edge cases
    - SOS with 0 contacts → prompt shown (Req 3.4)
    - SOS with location denied → fallback message sent (Req 3.5)
    - SOS success → confirmation banner shown (Req 3.7)
    - Geolocation timeout after 10 s → `status:'timeout'` returned (Req 4.3)
    - Alarm starts on SOS when enabled (Req 5.1)
    - Stop button appears while alarm plays (Req 5.2)
    - Stop button stops alarm (Req 5.3)
    - Auth error message does not contain "email" or "password" (Req 1.6)
    - _Requirements: 1.6, 3.4, 3.5, 3.7, 4.3, 5.1, 5.2, 5.3_

- [ ] 12. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All code lives in `index.html` inside one `<script type="module">` block; pure logic functions are also exported for `index.test.js`
- Property tests use **fast-check** loaded from CDN or npm; minimum 100 iterations each
- Each property test comment must follow the format: `// Feature: women-safety-alert, Property {N}: {text}`
- Firebase config keys are embedded in the HTML — Firestore security rules enforce access control
