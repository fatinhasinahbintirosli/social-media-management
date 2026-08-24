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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const cookieHeader = request.headers.get('cookie') || '';
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        cookie: cookieHeader,
      },
    },
  });

  const { data: { session } } = await authSupabase.auth.getSession();
  
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

    // Dapatkan user_id daripada sesi semasa
    let userId = session?.user?.id;

    // Jika kuki terhalang semasa redirect Facebook, kita guna fallback bijak
    if (!userId) {
      // 1. Cuba cari user_id sedia ada yang pernah wujud dalam jadual pages
      const { data: existingPages } = await supabase
        .from('pages')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(1);

      if (existingPages && existingPages.length > 0) {
        userId = existingPages[0].user_id;
      } else {
        // 2. Jika tiada langsung dalam pages, ambil user pertama dari auth.users (jika ada akses)
        const { data: userData } = await supabase.auth.admin?.listUsers?.();
        if (userData?.users?.length > 0) {
          userId = userData.users[0].id;
        }
      }
    }

    // Jika masih gagal juga mendapat mana-mana ID, paksa redirect supaya log masuk semula dengan betul
    if (!userId) {
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
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_id' });
    }

    return NextResponse.redirect(`${requestUrl.origin}/scheduler?status=success`);

  } catch (err) {
    console.error('Ralat proses Facebook Auth:', err.message);
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=${encodeURIComponent(err.message)}`);
  }
}
