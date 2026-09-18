import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();

console.log('Testing remote Supabase project:', url);

async function runAudit() {
  // 1. Check if public.profiles exists in schema cache
  const profilesRes = await fetch(`${url}/rest/v1/profiles?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log('1. profiles status:', profilesRes.status);
  const profilesBody = await profilesRes.text();
  console.log('   profiles body preview:', profilesBody.slice(0, 300));

  // 2. Check OpenAPI definitions for profiles columns and table
  const openApiRes = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const openApi = await openApiRes.json();
  const profileDef = openApi?.definitions?.profiles;
  if (profileDef) {
    console.log('2. profiles definition found in OpenAPI schema:');
    console.log('   Columns:', Object.keys(profileDef.properties || {}));
    console.log('   Required:', profileDef.required);
  } else {
    console.log('2. profiles definition in OpenAPI:', Boolean(profileDef));
    console.log('   All definitions:', Object.keys(openApi.definitions || {}));
  }

  // 3. Test is_admin() RPC function
  const isAdminRes = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  console.log('3. is_admin RPC status:', isAdminRes.status);
  console.log('   is_admin RPC body (anon):', await isAdminRes.text());
}

runAudit();
