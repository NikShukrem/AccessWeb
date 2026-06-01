#!/usr/bin/env node
// Simple API test script

const BASE_URL = 'http://localhost:8080';
let token = null;

async function req(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };
  
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  
  console.log(`${method} ${path}:`, res.status, JSON.stringify(data, null, 2));
  return data;
}

async function test() {
  console.log('\n=== TEST 1: Login ===');
  const login = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
  token = login.token;
  
  console.log('\n=== TEST 2: Get Me ===');
  await req('GET', '/api/auth/me');
  
  console.log('\n=== TEST 3: Create ACID ===');
  const acid = await req('POST', '/api/acids', {
    acid: 'AC-001',
    gruzootravitel: 'ООО Экспорт',
    status: 'pending',
    postavshchik: 'Хозяйство Альфа',
    naimenovanie: 'Хлопок сырец',
    gw_kg: '1000',
    kti_nomer: 'KTI-2026-001'
  });
  
  console.log('\n=== TEST 4: List ACIDs ===');
  await req('GET', '/api/acids?limit=10&offset=0');
  
  console.log('\n=== TEST 5: Get Single ACID ===');
  if (acid.data?.id) {
    await req('GET', `/api/acids/${acid.data.id}`);
  }
  
  console.log('\n✅ All tests completed');
  process.exit(0);
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
