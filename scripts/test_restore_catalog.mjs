const BASE_URL = 'http://localhost:3000';

async function testRestore() {
  console.log('--- Logging in as admin via dev-login ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'admin',
      id: '0fd43c02-58c1-4bae-a51b-57ef78b9450a',
      email: 'iam.anshumannn@gmail.com',
      name: 'Anshuman Das',
    }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginRes.status, 'Cookie set:', Boolean(setCookie));
  const cookie = setCookie ? setCookie.split(';')[0] : '';

  console.log('\n--- Calling POST /api/admin/restore-catalog ---');
  const restoreRes = await fetch(`${BASE_URL}/api/admin/restore-catalog`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });

  const data = await restoreRes.json();
  console.log('Restore status:', restoreRes.status);
  console.log('Restore result:', JSON.stringify(data, null, 2));
}

testRestore();
