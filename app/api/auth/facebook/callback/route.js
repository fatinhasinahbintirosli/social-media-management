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
    // 1. Tukar code kepada short-lived token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(`Ralat Tukar Token Facebook: ${JSON.stringify(tokenData.error)}`, { status: 500 });
    }

    const shortToken = tokenData.access_token;

    // 2. Tukar kepada Long-Lived User Access Token
    const longTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();

    const userAccessToken = longTokenData.access_token || shortToken;

    // 3. Tarik senarai Pages
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      return new NextResponse(`Ralat Graph API Pages: ${JSON.stringify(pagesData.error)}`, { status: 500 });
    }

    const pages = pagesData.data || [];

    // --- BAHAGIAN DEBUG ---
    // Kod ini memaparkan terus senarai page yang dijumpai pada skrin anda
    return new NextResponse(JSON.stringify({
      status: "Berjaya hubungi Facebook!",
      total_pages_found: pages.length,
      raw_pages_data: pages
    }, null, 2), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    return new NextResponse(`Ralat Sistem Keseluruhan (Catch): ${err.message}`, { status: 500 });
  }
}
