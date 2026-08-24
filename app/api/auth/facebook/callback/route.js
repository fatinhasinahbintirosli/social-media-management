import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new NextResponse('Ralat: Tiada kod (code) diterima daripada Facebook.', { status: 400 });
  }

  const clientId = process.env.FACEBOOK_APP_ID || '1746001423192963'; 
  const clientSecret = process.env.FACEBOOK_APP_SECRET; 
  const redirectUri = 'https://social-media-management-tool-lac.vercel.app/api/auth/facebook/callback';

  try {
    // 1. Cuba tukar code kepada token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`;
    
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new NextResponse(`Ralat Token Facebook: ${JSON.stringify(tokenData)}`, { status: 500 });
    }

    const userAccessToken = tokenData.access_token;

    // 2. Cuba ambil senarai pages
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesData.data) {
      return new NextResponse(`Ralat Graph API Pages: ${JSON.stringify(pagesData)}`, { status: 500 });
    }

    const pages = pagesData.data;

    // 3. Cuba masukkan ke Supabase
    for (const page of pages) {
      const { error: dbError } = await supabase
        .from('pages')
        .upsert({
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token,
          is_active: true
        }, { onConflict: 'page_id' });

      if (dbError) {
        return new NextResponse(`Ralat Supabase Database: ${dbError.message}`, { status: 500 });
      }
    }

    return new NextResponse('BERJAYA! Semua page telah disimpan ke Supabase. Sila kembali ke halaman scheduler.', { status: 200 });

  } catch (err) {
    return new NextResponse(`Ralat Sistem Keseluruhan: ${err.message}`, { status: 500 });
  }
}
