import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=facebook_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=no_code`);
  }

  // Guna client standard berserta token auth daripada header/cookies jika perlu, 
  // atau kita benarkan proses dengan mengambil cookie manual / token dari pelayar.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Ambil authorization token atau cookie dari header request masuk
  const cookieHeader = request.headers.get('cookie') || '';
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  // Untuk mengelakkan ralat sesi, kita boleh luluskan pengepala kuki
  const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        cookie: cookieHeader,
      },
    },
  });

  const { data: { session }, error: sessionError } = await authSupabase.auth.getSession();

  // Langkah keselamatan alternatif jika cookie tidak sampai semasa redirect Facebook:
  // Kita boleh benarkan akses jika kod rujukan sah, atau semak token dari parameter.
  // Walau bagaimanapun, pastikan anda log masuk pada tab yang sama.
  
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = `${requestUrl.origin}/api/auth/facebook/callback`;

  try {
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Gagal mendapatkan Facebook access token.');
    }

    const userAccessToken = tokenData.access_token;

    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}&limit=100`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(pagesData.error.message);
    }

    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=no_pages_found`);
    }

    // Cari user_id yang sah daripada session jika ada, atau guna fallback dari database jika perlu.
    // Jika session aktif:
    let userId = session?.user?.id;

    if (!userId) {
      // Jika kuki pelayan terhalang semasa redirect Facebook, 
      // kita cuba ambil user terakhir yang aktif atau paparkan status log masuk semula.
      return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=not_logged_in`);
    }

    for (const page of pages) {
      await supabase
        .from('pages')
        .upsert({
          user_id: userId,
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_id' });
    }

    return NextResponse.redirect(`${requestUrl.origin}/scheduler?status=success`);

  } catch (err) {
    console.error('Ralat proses Facebook Auth:', err.message);
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=${encodeURIComponent(err.message)}`);
  }
}
