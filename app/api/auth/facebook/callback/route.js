import { NextResponse } from 'next/server';

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

    // Daripada terus simpan ke Supabase, kita hantar senarai page ke halaman /select-pages melalui HTML Script sessionStorage
    const serializedPages = JSON.stringify(pages);

    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head><title>Memproses Akaun...</title></head>
        <body style="background:#121212; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
          <div style="text-align:center;">
            <h3>Berjaya log masuk Facebook! Sedang memuatkan senarai Page...</h3>
          </div>
          <script>
            try {
              sessionStorage.setItem('fb_temp_pages', '${serializedPages.replace(/'/g, "\\'")}');
              window.location.href = '/select-pages';
            } catch (e) {
              alert('Ralat menyimpan sesi sementara.');
              window.location.href = '/scheduler';
            }
          </script>
        </body>
      </html>
    `;

    return new Response(htmlResponse, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (err) {
    console.error('Ralat proses Facebook Auth:', err.message);
    return NextResponse.redirect(`${requestUrl.origin}/scheduler?error=${encodeURIComponent(err.message)}`);
  }
}
