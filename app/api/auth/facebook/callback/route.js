import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return new NextResponse(`Ralat Facebook / Tiada Kod: ${error || 'No code provided'}`, { status: 400 });
  }

  // 1. Inisialisasi Supabase client untuk mendapatkan user sesi semasa
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
      }
    }
  );

  // Ambil token/session daripada cookies atau request headers pelayar pengguna
  // Nota: Jika anda menggunakan cookie standard Next.js dengan Supabase SSR, pastikan cookie dihantar bersama.
  // Alternatif paling selamat untuk route handler API Facebook callback:
  const cookieHeader = request.headers.get('cookie') || '';
  
  // Kita guna client khas untuk semak auth user yang sedang login di browser
  const supabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { headers: { cookie: cookieHeader } }
    }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    return new NextResponse('Ralat: Anda belum log masuk ke dalam aplikasi. Sila log masuk semula sebelum menyambungkan Facebook.', { status: 401 });
  }

  const userId = user.id;

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    // 2. Tukar code kepada short-lived token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(`Ralat Tukar Token Facebook: ${JSON.stringify(tokenData.error)}`, { status: 500 });
    }

    const shortToken = tokenData.access_token;

    // 3. Tukar kepada Long-Lived User Access Token
    const longTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();

    const userAccessToken = longTokenData.access_token || shortToken;

    // 4. Tarik kesemua senarai Pages menggunakan Pagination Loop (Sokong Page ke-2, ke-3, dst)
    let allPages = [];
    let nextUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}&limit=100`;

    while (nextUrl) {
      const pagesRes = await fetch(nextUrl);
      const pagesData = await pagesRes.json();

      if (pagesData.error) {
        return new NextResponse(`Ralat Graph API Pages: ${JSON.stringify(pagesData.error)}`, { status: 500 });
      }

      if (pagesData.data) {
        allPages = [...allPages, ...pagesData.data];
      }

      nextUrl = pagesData.paging && pagesData.paging.next ? pagesData.paging.next : null;
    }

    if (allPages.length === 0) {
      return new NextResponse('Amaran: Log masuk berjaya, tetapi tiada Page dijumpai pada akaun Facebook ini.', { status: 200 });
    }

    // 5. Simpan ke Supabase berserta user_id
    for (const page of allPages) {
      const { error: dbError } = await supabase
        .from('pages')
        .upsert({
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          user_id: userId, // <-- Menyimpan ID pengguna semasa supaya page terikat secara khusus
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_id' });

      if (dbError) {
        return new NextResponse(`Ralat Supabase Database: ${dbError.message}`, { status: 500 });
      }
    }

    // 6. Berjaya! Redirect kembali ke scheduler
    return NextResponse.redirect(`${origin}/scheduler?status=success`);

  } catch (err) {
    return new NextResponse(`Ralat Sistem Keseluruhan (Catch): ${err.message}`, { status: 500 });
  }
}
