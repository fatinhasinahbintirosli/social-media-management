import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Tetapkan Supabase client menggunakan Service Role atau Anon Key dengan kebenaran yang betul
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/scheduler?status=error&message=NoCodeProvided', request.url));
  }

  // Masukkan App ID dan App Secret Facebook anda
  const clientId = '1746001423192963'; 
  const clientSecret = process.env.FACEBOOK_APP_SECRET; // Pastikan anda tetapkan secret ini di env Vercel / .env.local
  const redirectUri = 'https://social-media-management-tool-lac.vercel.app/api/auth/facebook/callback';

  try {
    // 1. Tukar 'code' kepada User Access Token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`;
    
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Gagal mendapatkan User Access Token.');
    }

    const userAccessToken = tokenData.access_token;

    // 2. Ambil senarai Facebook Pages berserta Page Access Token milik pengguna
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesData.data) {
      throw new Error('Gagal menarik senarai Pages daripada Facebook.');
    }

    const pages = pagesData.data;

    // 3. Simpan atau kemaskini secara automatik ke dalam database Supabase (jadual 'pages')
    for (const page of pages) {
      const { error: upsertError } = await supabase
        .from('pages')
        .upsert({
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token, // Token khas untuk post ke page tersebut
          category: page.category || 'General',
          updated_at: new Date().toISOString()
        }, { onConflict: 'page_id' });

      if (upsertError) {
        console.error(`Ralat menyimpan page ${page.name}:`, upsertError.message);
      }
    }

    // 4. Redirect semula ke halaman scheduler dengan status kejayaan
    return NextResponse.redirect(new URL('/scheduler?status=success', request.url));

  } catch (err) {
    console.error('Callback Error:', err.message);
    return NextResponse.redirect(new URL(`/scheduler?status=error&message=${encodeURIComponent(err.message)}`, request.url));
  }
}
