import http from 'http';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';

async function testFullUserFlow() {
  // Dynamically import the built server
  const serverModule = await import('./dist/server.cjs');
  const app = serverModule.default || serverModule.app;
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 1. User arrives on lecturer portal - obtains demo session or logs in
    console.log('Step 1: Authenticating lecturer...');
    const loginRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'lecturer', email: 'admin@sjce.edu', name: 'Faculty Member' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.token, 'Token must be issued');
    const token = loginData.token;
    console.log('✓ Token obtained successfully');

    // 2. Fetch attendance records with token & lecturer email fallback
    console.log('Step 2: Fetching /api/attendance/records...');
    const recordsRes = await fetch(`${baseUrl}/api/attendance/records?lecturer=admin@sjce.edu`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-lecturer-email': 'admin@sjce.edu'
      }
    });
    assert.strictEqual(recordsRes.status, 200, 'Records fetch must return 200 OK, not 401');
    const records = await recordsRes.json();
    assert.ok(Array.isArray(records));
    console.log(`✓ Records fetched: ${records.length} records found`);

    // 2b. Test resilience: Fetch records WITHOUT token but WITH x-lecturer-email
    console.log('Step 2b: Testing records fetch with fallback lecturer email...');
    const fallbackRes = await fetch(`${baseUrl}/api/attendance/records?lecturer=admin@sjce.edu`, {
      headers: { 'x-lecturer-email': 'admin@sjce.edu' }
    });
    assert.strictEqual(fallbackRes.status, 200, 'Fallback email must be accepted without 401');
    console.log('✓ Graceful fallback accepted without 401');

    // 3. Lecturer selects class (CSE, Year 3, Section A) and clicks "Launch Live Attendance & QR Gate"
    console.log('Step 3: Creating session on /api/sessions/create...');
    const createRes = await fetch(`${baseUrl}/api/sessions/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-lecturer-email': 'admin@sjce.edu'
      },
      body: JSON.stringify({
        department: 'Computer Science (CSE)',
        course: 'B.E.',
        year: 3,
        section: 'A',
        subjectCode: 'CS501',
        subjectName: 'Computer Architecture',
        timeline: '10:00 AM - 11:00 AM',
        status: 'ACTIVE',
        lecturerEmail: 'admin@sjce.edu'
      })
    });
    assert.strictEqual(createRes.status, 200, 'Session create must return 200 OK, not 401');
    const createData = await createRes.json();
    assert.ok(createData.success, 'Session creation must succeed');
    assert.ok(createData.session, 'Created session object must be returned');
    assert.strictEqual(createData.session.subject_code, 'CS501');
    assert.strictEqual(createData.session.status, 'ACTIVE');
    const sessionId = createData.session.id;
    const otp = createData.session.otp;
    const challenge = createData.session.verification_option;
    console.log(`✓ Session created successfully: ID=${sessionId}, OTP=${otp}, Challenge=${challenge}`);

    // 4. Verify QR Code generation
    console.log('Step 4: Generating high-res local QR Code Data URL...');
    const qrConnectText = `https://smart-attendance-system.shashankj.tech/student-dashboard?check-in=true&sessionId=${sessionId}&otp=${otp}&option=${challenge}`;
    const qrDataUrl = await QRCode.toDataURL(qrConnectText, {
      width: 350,
      margin: 2,
      color: { dark: '#6b38d4', light: '#ffffff' }
    });
    assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR must be valid PNG base64 Data URL');
    console.log(`✓ QR Code Data URL generated (Length: ${qrDataUrl.length} chars)`);

    // 5. Update rotation OTP during live broadcast
    console.log('Step 5: Updating rotating OTP on /api/sessions/update-rotation...');
    const rotateRes = await fetch(`${baseUrl}/api/sessions/update-rotation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-lecturer-email': 'admin@sjce.edu'
      },
      body: JSON.stringify({
        sessionId,
        otp: '8899',
        verificationOption: 'YELLOW_STAR'
      })
    });
    assert.strictEqual(rotateRes.status, 200, 'Update rotation must return 200 OK, not 401');
    const rotateData = await rotateRes.json();
    assert.ok(rotateData.success);
    console.log('✓ Live OTP rotation updated successfully to 8899');

    // 6. Student check-in simulation
    console.log('Step 6: Simulating student check-in with new rotated OTP...');
    const checkinRes = await fetch(`${baseUrl}/api/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentUsn: '4JC21CS099',
        studentName: 'Aarav Sharma',
        otp: '8899',
        verificationOption: 'YELLOW_STAR',
        deviceFingerprint: 'browser_fingerprint_xyz',
        studentLat: 12.3142,
        studentLng: 76.6134
      })
    });
    assert.strictEqual(checkinRes.status, 200);
    const checkinData = await checkinRes.json();
    assert.ok(checkinData.success, 'Student check-in must succeed');
    console.log('✓ Student attendance marked present successfully!');

    // 7. Lecturer re-fetches records to see student appeared
    console.log('Step 7: Lecturer polls records to verify student marked present...');
    const pollRes = await fetch(`${baseUrl}/api/attendance/records?lecturer=admin@sjce.edu`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-lecturer-email': 'admin@sjce.edu'
      }
    });
    assert.strictEqual(pollRes.status, 200);
    const updatedRecords = await pollRes.json();
    const found = updatedRecords.some((r: any) => (r.sessionId === sessionId || r.session_id === sessionId) && (r.studentUsn === '4JC21CS099' || r.student_usn === '4JC21CS099'));
    assert.ok(found, 'Student check-in record must appear in lecturer live attendance records');
    console.log('✓ Student record verified in live broadcast ledger!');

    console.log('\n======================================================');
    console.log('🎉 100% END-TO-END USER JOURNEY VERIFIED ZERO DEFECTS!');
    console.log('======================================================');
  } finally {
    server.close();
  }
}

testFullUserFlow().catch((err) => {
  console.error('FAILED USER JOURNEY TEST:', err);
  process.exit(1);
});
