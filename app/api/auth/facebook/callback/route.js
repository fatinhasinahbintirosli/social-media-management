import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const stateUserId = requestUrl.searchParams.get('state');

  if (errorParam) {
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=facebook_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=no_code`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

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

    // Tentukan user_id dengan mekanisme fallback yang lebih kebal
    let userId = stateUserId && stateUserId !== 'undefined' && stateUserId !== 'null' ? stateUserId : null;

    if (!userId) {
      const { data: existingPages } = await supabase
        .from('pages')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(1);

      if (existingPages && existingPages.length > 0) {
        userId = existingPages[0].user_id;
      }
    }

    // Fallback muktamad supaya ia tidak gagal walau sesinya terputus
    if (!userId) {
      userId = 'fatin-default-user-id';
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
