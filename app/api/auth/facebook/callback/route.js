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
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

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

    // Tarik senarai pages beserta gambar profil (picture) dari Graph API
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture&access_token=${userAccessToken}&limit=100`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(pagesData.error.message);
    }

    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=no_pages_found`);
    }

    let userId = 'fatin-default-user-id';
    const { data: existingPages } = await supabase
      .from('pages')
      .select('user_id')
      .not('user_id', 'is', null)
      .limit(1);

    if (existingPages && existingPages.length > 0) {
      userId = existingPages[0].user_id;
    }

    // Simpan senarai page berserta URL gambar profil
    for (const page of pages) {
      const picUrl = page.picture?.data?.url || '';
      
      await supabase
        .from('pages')
        .upsert({
          user_id: userId,
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          picture_url: picUrl, // Simpan URL DP Page
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_id' });
    }

    const serializedPages = JSON.stringify(pages);
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head><title>Memproses Akaun...</title></head>
        <body style="background:#121212; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
          <div style="text-align:center;">
            <h3>Berjaya log masuk! Menyediakan pilihan akaun...</h3>
          </div>
          <script>
            try {
              sessionStorage.setItem('fb_temp_pages', '${serializedPages.replace(/'/g, "\\'")}');
              window.location.href = '/select-pages';
            } catch (e) {
              window.location.href = '/scheduler/manage-accounts';
            }
          </script>
        </body>
      </html>
    `;

    return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  } catch (err) {
    console.error('Ralat proses Facebook Auth:', err.message);
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=${encodeURIComponent(err.message)}`);
  }
}
