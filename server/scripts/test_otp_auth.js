import express from 'express';
import db from '../src/db/index.js';
import { createSchema } from '../src/db/schema.js';
import authRouter from '../src/routes/auth.js';

createSchema();

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const server = app.listen(5099, async () => {
  try {
    console.log('--- TEST 1: Admin OTP via shubhamkumar040605@gmail.com ---');
    let res = await fetch('http://localhost:5099/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shubhamkumar040605@gmail.com' })
    });
    let data = await res.json();
    console.log('Admin (shubham) request OTP response:', data);

    let latestOtp = db.prepare('SELECT * FROM otps ORDER BY id DESC LIMIT 1').get();
    console.log('Admin OTP Record in DB:', {
      email: latestOtp.email,
      target_email: latestOtp.target_email,
      role: latestOtp.role,
      otp: latestOtp.otp
    });
    if (latestOtp.target_email !== 'shubhamkumar040605@gmail.com') {
      throw new Error(`Expected target_email to be shubhamkumar040605@gmail.com, got ${latestOtp.target_email}`);
    }

    console.log('\n--- TEST 2: Admin OTP via legacy admin@smartwaste.gov ---');
    res = await fetch('http://localhost:5099/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@smartwaste.gov' })
    });
    data = await res.json();
    console.log('Admin (legacy) request OTP response:', data);

    latestOtp = db.prepare('SELECT * FROM otps ORDER BY id DESC LIMIT 1').get();
    console.log('Admin OTP Record in DB:', {
      email: latestOtp.email,
      target_email: latestOtp.target_email,
      role: latestOtp.role,
      otp: latestOtp.otp
    });
    if (latestOtp.target_email !== 'shubhamkumar040605@gmail.com') {
      throw new Error(`Expected admin OTP to route to shubhamkumar040605@gmail.com, got ${latestOtp.target_email}`);
    }

    console.log('\n--- TEST 3: Driver OTP via driver1@smartwaste.gov ---');
    res = await fetch('http://localhost:5099/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver1@smartwaste.gov' })
    });
    data = await res.json();
    console.log('Driver request OTP response:', data);

    latestOtp = db.prepare('SELECT * FROM otps ORDER BY id DESC LIMIT 1').get();
    console.log('Driver OTP Record in DB:', {
      email: latestOtp.email,
      target_email: latestOtp.target_email,
      role: latestOtp.role,
      otp: latestOtp.otp
    });
    if (latestOtp.target_email !== 'driver1@smartwaste.gov') {
      throw new Error(`Expected driver OTP to route to driver1@smartwaste.gov, got ${latestOtp.target_email}`);
    }

    console.log('\n--- TEST 4: Verify OTP for Driver ---');
    res = await fetch('http://localhost:5099/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver1@smartwaste.gov', otp: latestOtp.otp })
    });
    data = await res.json();
    console.log('Driver verify response:', { status: res.status, user: data.user, hasToken: !!data.token });
    if (!data.token || data.user.role !== 'driver') {
      throw new Error('Driver verification failed to produce token or correct role');
    }

    console.log('\n--- TEST 5: Verify Used OTP fails ---');
    res = await fetch('http://localhost:5099/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver1@smartwaste.gov', otp: latestOtp.otp })
    });
    console.log('Used OTP verify status (expecting 400):', res.status);
    if (res.status !== 400) throw new Error('Used OTP was accepted!');

    console.log('\n--- TEST 6: Verify Admin OTP ---');
    // Request fresh admin OTP
    await fetch('http://localhost:5099/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shubhamkumar040605@gmail.com' })
    });
    const adminOtp = db.prepare("SELECT * FROM otps WHERE role = 'admin' AND used = 0 ORDER BY id DESC LIMIT 1").get();
    res = await fetch('http://localhost:5099/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shubhamkumar040605@gmail.com', otp: adminOtp.otp })
    });
    data = await res.json();
    console.log('Admin verify response:', { status: res.status, user: data.user, hasToken: !!data.token });
    if (!data.token || data.user.role !== 'admin') {
      throw new Error('Admin verification failed to produce token or admin role');
    }

    console.log('\nALL 6 TESTS PASSED SUCCESSFULLY! ✅');
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
