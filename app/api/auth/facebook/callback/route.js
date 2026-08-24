import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/scheduler?error=NoCode', request.url));
  }

  const clientId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const clientSecret = process.env.FB_APP_SECRET;
  const redirectUri = `${url.origin}/api/auth/facebook/callback`;

  try {
    // 1. Dapatkan User Access Token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    
    if (!tokenData.access_token) throw new Error('Gagal mendapatkan token Facebook.');

    // 2. Dapatkan senarai Pages yang diuruskan pengguna
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.data && pagesData.data.length > 0) {
      // Setup Supabase Service Client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // 3. Simpan atau kemaskini pages ke dalam Supabase
      for (const page of pagesData.data) {
        await supabase.from('pages').upsert({
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
        }, { onConflict: 'page_id' });
      }
    }

    // Bawa pengguna kembali ke halaman scheduler dengan status berjaya
    return NextResponse.redirect(new URL('/scheduler?success=PagesConnected', request.url));
  } catch (err) {
    console.error('Auth Error:', err);
    return NextResponse.redirect(new URL('/scheduler?error=AuthFailed', request.url));
  }
}
