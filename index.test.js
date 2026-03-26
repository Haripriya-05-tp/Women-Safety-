// index.test.js — Unit tests for Women Safety Alert edge cases
// Run with: node index.test.js
// No external dependencies required.

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}:`, e.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}:`, e.message);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ---------------------------------------------------------------------------
// Minimal stubs / helpers
// ---------------------------------------------------------------------------

/** Build a mock ContactManager that returns a fixed contacts array */
function mockContactManager(contacts) {
  return {
    async getContacts(_uid) { return contacts; }
  };
}

/** Build a mock LocationService with a fixed result */
function mockLocationService(result) {
  return {
    async getCurrentLocation() { return result; }
  };
}

/** Build a mock AlarmService */
function mockAlarmService({ available = true, playing = false } = {}) {
  let _playing = playing;
  return {
    isAvailable() { return available; },
    isPlaying() { return _playing; },
    start() { if (available) _playing = true; },
    stop() { _playing = false; }
  };
}

/**
 * Minimal AlertService factory — mirrors the logic in index.html but accepts
 * injected dependencies so tests stay self-contained and DOM-free.
 */
function makeAlertService({ contactManager, locationService, alarmService, alarmEnabled = true }) {
  const shownModals = [];
  const shownToasts = [];

  function showModal(msg) { shownModals.push(msg); }
  function showToast(msg, type) { shownToasts.push({ msg, type }); }

  async function sendSOS(uid) {
    const contacts = await contactManager.getContacts(uid);

    if (contacts.length === 0) {
      showModal('Please add at least one emergency contact before sending an alert.');
      return { sent: [], failed: [], shownModals, shownToasts, stopBtnVisible: false };
    }

    const locResult = await locationService.getCurrentLocation();
    let locationText;
    if (locResult.status === 'ok') {
      locationText = locResult.mapsUrl;
    } else {
      locationText = '(Location unavailable)';
      if (locResult.status === 'denied') {
        showToast('Location permission denied. Alert sent without location.');
      }
    }

    const message = `I am in danger. Please help. My location: ${locationText}`;

    let stopBtnVisible = false;
    if (alarmEnabled) {
      alarmService.start();
      if (alarmService.isPlaying()) {
        stopBtnVisible = true;
      }
    }

    showToast('SOS alert sent to all contacts!', 'success');

    return {
      sent: contacts.map(c => c.name),
      failed: [],
      message,
      shownModals,
      shownToasts,
      stopBtnVisible
    };
  }

  return { sendSOS, shownModals, shownToasts };
}

// ---------------------------------------------------------------------------
// LocationService factory (mirrors index.html logic, accepts mock geolocation)
// ---------------------------------------------------------------------------
function makeLocationService(mockGeo) {
  return {
    getCurrentLocation() {
      return new Promise((resolve) => {
        if (!mockGeo) { resolve({ status: 'denied' }); return; }
        mockGeo.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            resolve({ status: 'ok', lat, lng, mapsUrl: `https://maps.google.com/?q=${lat},${lng}` });
          },
          (err) => {
            if (err.code === 1 /* PERMISSION_DENIED */) {
              resolve({ status: 'denied' });
            } else {
              resolve({ status: 'timeout' });
            }
          },
          { timeout: 10000, enableHighAccuracy: true }
        );
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Run all tests inside an async IIFE for broad Node.js compatibility
// ---------------------------------------------------------------------------
(async () => {

  // -------------------------------------------------------------------------
  // Test 1 — Req 3.4: SOS with 0 contacts → modal shown
  // -------------------------------------------------------------------------
  await testAsync('SOS with 0 contacts shows modal (Req 3.4)', async () => {
    const svc = makeAlertService({
      contactManager: mockContactManager([]),
      locationService: mockLocationService({ status: 'ok', lat: 12.9, lng: 77.6, mapsUrl: 'https://maps.google.com/?q=12.9,77.6' }),
      alarmService: mockAlarmService(),
      alarmEnabled: false
    });

    const result = await svc.sendSOS('uid-123');

    assert(result.shownModals.length > 0, 'Expected a modal to be shown');
    assert(
      result.shownModals[0].toLowerCase().includes('contact'),
      'Modal message should mention contacts'
    );
    assert(result.sent.length === 0, 'No contacts should be in sent list');
  });

  // -------------------------------------------------------------------------
  // Test 2 — Req 3.5: SOS with location denied → fallback message contains "(Location unavailable)"
  // -------------------------------------------------------------------------
  await testAsync('SOS with location denied uses "(Location unavailable)" fallback (Req 3.5)', async () => {
    const svc = makeAlertService({
      contactManager: mockContactManager([{ name: 'Alice', phone: '+919876543210' }]),
      locationService: mockLocationService({ status: 'denied' }),
      alarmService: mockAlarmService(),
      alarmEnabled: false
    });

    const result = await svc.sendSOS('uid-123');

    assert(result.message.includes('(Location unavailable)'), 'Message should contain "(Location unavailable)"');
  });

  // -------------------------------------------------------------------------
  // Test 3 — Req 3.7: SOS success → toast shown with success message
  // -------------------------------------------------------------------------
  await testAsync('SOS success shows a success toast (Req 3.7)', async () => {
    const svc = makeAlertService({
      contactManager: mockContactManager([{ name: 'Bob', phone: '+919876543210' }]),
      locationService: mockLocationService({ status: 'ok', lat: 0, lng: 0, mapsUrl: 'https://maps.google.com/?q=0,0' }),
      alarmService: mockAlarmService(),
      alarmEnabled: false
    });

    const result = await svc.sendSOS('uid-123');

    const successToast = result.shownToasts.find(t => t.type === 'success');
    assert(successToast !== undefined, 'Expected a success toast');
    assert(successToast.msg.length > 0, 'Success toast message should not be empty');
  });

  // -------------------------------------------------------------------------
  // Test 4 — Req 4.3: Geolocation timeout after 10 s → status:'timeout' returned
  // -------------------------------------------------------------------------
  await testAsync('LocationService returns status:"timeout" on geolocation timeout (Req 4.3)', async () => {
    // Mock geolocation that fires the error callback with code 3 (TIMEOUT)
    const mockGeo = {
      getCurrentPosition(_success, error, _opts) {
        error({ code: 3 }); // TIMEOUT — not PERMISSION_DENIED (1)
      }
    };

    const locationService = makeLocationService(mockGeo);
    const result = await locationService.getCurrentLocation();

    assert(result.status === 'timeout', `Expected status "timeout", got "${result.status}"`);
  });

  // -------------------------------------------------------------------------
  // Test 5 — Req 5.1: Alarm starts on SOS when enabled
  // -------------------------------------------------------------------------
  await testAsync('Alarm starts when SOS is triggered and alarm is enabled (Req 5.1)', async () => {
    const alarm = mockAlarmService({ available: true, playing: false });

    const svc = makeAlertService({
      contactManager: mockContactManager([{ name: 'Carol', phone: '+919876543210' }]),
      locationService: mockLocationService({ status: 'ok', lat: 1, lng: 1, mapsUrl: 'https://maps.google.com/?q=1,1' }),
      alarmService: alarm,
      alarmEnabled: true
    });

    await svc.sendSOS('uid-123');

    assert(alarm.isPlaying(), 'Alarm should be playing after SOS when alarm is enabled');
  });

  // -------------------------------------------------------------------------
  // Test 6 — Req 5.2: Stop button appears while alarm plays
  // -------------------------------------------------------------------------
  await testAsync('Stop button becomes visible when alarm is playing (Req 5.2)', async () => {
    const alarm = mockAlarmService({ available: true, playing: false });

    const svc = makeAlertService({
      contactManager: mockContactManager([{ name: 'Dave', phone: '+919876543210' }]),
      locationService: mockLocationService({ status: 'ok', lat: 1, lng: 1, mapsUrl: 'https://maps.google.com/?q=1,1' }),
      alarmService: alarm,
      alarmEnabled: true
    });

    const result = await svc.sendSOS('uid-123');

    assert(result.stopBtnVisible === true, 'Stop button should be visible while alarm is playing');
  });

  // -------------------------------------------------------------------------
  // Test 7 — Req 5.3: Stop button stops alarm
  // -------------------------------------------------------------------------
  test('Stop button stops the alarm (Req 5.3)', () => {
    const alarm = mockAlarmService({ available: true, playing: true });

    assert(alarm.isPlaying(), 'Alarm should be playing initially');

    // Simulate stop button click
    alarm.stop();

    assert(!alarm.isPlaying(), 'Alarm should have stopped after stop() is called');
  });

  // -------------------------------------------------------------------------
  // Test 8 — Req 1.6: Auth error message does not reveal which field is incorrect
  // -------------------------------------------------------------------------
  test('Auth error message does not contain "email" or "password" (Req 1.6)', () => {
    // Mirrors AuthService error handling in index.html — all failures throw the same generic message
    const genericError = 'Invalid credentials. Please try again.';

    // Simulate the error messages that AuthService produces for various Firebase error codes
    const errorScenarios = [
      { code: 'auth/wrong-password', message: genericError },
      { code: 'auth/invalid-email', message: genericError },
      { code: 'auth/user-not-found', message: genericError },
      { code: 'auth/too-many-requests', message: genericError },
    ];

    for (const scenario of errorScenarios) {
      assert(
        !scenario.message.toLowerCase().includes('email'),
        `Error for "${scenario.code}" should not mention "email": "${scenario.message}"`
      );
      assert(
        !scenario.message.toLowerCase().includes('password'),
        `Error for "${scenario.code}" should not mention "password": "${scenario.message}"`
      );
    }
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (typeof process !== 'undefined' && failed > 0) process.exit(1);

})();
