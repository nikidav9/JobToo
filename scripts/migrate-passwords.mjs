import bcrypt from 'bcryptjs';

const SUPABASE_URL = 'https://bbiqmkeysalwdonlnylb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXFta2V5c2Fsd2RvbmxueWxiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzgxMjk1MiwiZXhwIjoyMDkzMzg4OTUyfQ.WohVrhm1en7JZuBHTCYatW-5w3ex5eG-eT6wXw0xScs';

async function fetchUsers() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jm_users?select=id,password`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  return res.json();
}

async function updatePassword(id, hashedPassword) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jm_users?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ password: hashedPassword }),
  });
  return res.ok;
}

async function main() {
  console.log('Загружаем пользователей...');
  const users = await fetchUsers();
  console.log(`Найдено: ${users.length} пользователей`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    const pwd = user.password ?? '';
    if (pwd.startsWith('$2b$') || pwd.startsWith('$2a$')) {
      skipped++;
      continue;
    }
    if (!pwd) {
      console.log(`  [SKIP] ${user.id} — пустой пароль`);
      skipped++;
      continue;
    }
    try {
      const hashed = await bcrypt.hash(pwd, 10);
      const ok = await updatePassword(user.id, hashed);
      if (ok) {
        migrated++;
        process.stdout.write(`\r  Мигрировано: ${migrated}`);
      } else {
        console.log(`\n  [FAIL] ${user.id}`);
        failed++;
      }
    } catch (e) {
      console.log(`\n  [ERROR] ${user.id}:`, e.message);
      failed++;
    }
  }

  console.log(`\n\nГотово!`);
  console.log(`  Мигрировано: ${migrated}`);
  console.log(`  Пропущено (уже хэш): ${skipped}`);
  console.log(`  Ошибок: ${failed}`);
}

main().catch(console.error);
