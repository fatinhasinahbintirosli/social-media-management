import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return new NextResponse(`Ralat Facebook / Tiada Kod: ${error || 'No code provided'}`, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    // 1. Cuba tukar code kepada token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(`Ralat Tukar Token Facebook: ${JSON.stringify(tokenData.error)}`, { status: 500 });
    }

    const userAccessToken = tokenData.access_token;

    // 2. Cuba ambil senarai pages
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      return new NextResponse(`Ralat Graph API Pages: ${JSON.stringify(pagesData.error)}`, { status: 500 });
    }

    const pages = pagesData.data || [];

    if (pages.length === 0) {
      return new NextResponse('Amaran: Facebook berjaya diakses, tetapi tiada sebarang Page dijumpai pada akaun Facebook ini!', { status: 200 });
    }

    // 3. Cuba simpan ke Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    for (const page of pages) {
      const { error: dbError } = await supabase
        .from('pages')
        .upsert({
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_id' });

      if (dbError) {
        return new NextResponse(`Ralat Supabase Database: ${dbError.message}`, { status: 500 });
      }
    }

    return new NextResponse('BERJAYA! Data page telah berjaya masuk ke Supabase.', { status: 200 });

  } catch (err) {
    return new NextResponse(`Ralat Sistem Keseluruhan (Catch): ${err.message}`, { status: 500 });
  }
}
