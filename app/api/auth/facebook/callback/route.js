import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const clientId = '1746001423192963'; 
  const clientSecret = process.env.FACEBOOK_APP_SECRET; 
  const redirectUri = 'https://social-media-management-tool-lac.vercel.app/api/auth/facebook/callback';

  try {
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`;
    
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Gagal mendapatkan User Access Token.');
    }

    const userAccessToken = tokenData.access_token;

    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    // Debug: Jika tiada data pages langsung dari FB
    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('Facebook berjaya diakses, tetapi tiada Page ditemui pada akaun ini.');
    }

    const pages = pagesData.data;

    for (const page of pages) {
      const { data: existingPages } = await supabase
        .from('pages')
        .select('id')
        .eq('page_id', page.id)
        .limit(1);

      if (existingPages && existingPages.length > 0) {
        await supabase
          .from('pages')
          .update({
            page_name: page.name,
            access_token: page.access_token,
            is_active: true
          })
          .eq('page_id', page.id);
      } else {
        await supabase
          .from('pages')
          .insert({
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token,
            is_active: true
          });
      }
    }

    return NextResponse.redirect(new URL('/scheduler?status=success', request.url));

  } catch (err) {
    console.error('Callback Error:', err.message);
    // Paparkan ralat terus ke skrin supaya kita tahu puncanya
    return new NextResponse(`Ralat Integrasi Facebook: ${err.message}`, { status: 500 });
  }
}
