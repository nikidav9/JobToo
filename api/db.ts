import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { dispatch } from '../lib/db-dispatch';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const API_SECRET = process.env.API_SECRET ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const incoming = req.headers['x-app-secret'];
  if (!API_SECRET || incoming !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { fn, args = [] } = (req.body ?? {}) as { fn?: string; args?: unknown[] };
  if (!fn) return res.status(400).json({ error: 'Missing fn' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const data = await dispatch(supabase, fn, args);
    return res.status(200).json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/db]', fn, msg);
    return res.status(500).json({ error: msg });
  }
}
