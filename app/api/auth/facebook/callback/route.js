import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // 1. Semak jika pengguna membatalkan keizinan atau terdapat ralat dari Facebook
  if (error || !code) {
    return NextResponse.redirect(`${origin}/scheduler?status=error&message=${encodeURIComponent(error || 'No code provided')}`);
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    // 2. Tukar authorization code kepada User Access Token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const userAccessToken = tokenData.access_token;

    // 3. Ambil senarai Facebook Pages berserta Page Access Token
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(pagesData.error.message);
    }

    const pages = pagesData.data || [];

    if (pages.length === 0) {
      return NextResponse.redirect(`${origin}/scheduler?status=error&message=${encodeURIComponent('Tiada Facebook Page dijumpai untuk akaun ini.')}`);
    }

    // 4. Inisialisasi Supabase Client menggunakan Service Role Key untuk mengelakkan isu RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

   // 5. Simpan/Kemaskini senarai Pages secara manual ke dalam pangkalan data Supabase
    for (const page of pages) {
      // Semak sama ada page_id sudah wujud
      const { data: existingPage } = await supabase
        .from('pages')
        .select('id')
        .eq('page_id', page.id)
        .maybeSingle();

      if (existingPage) {
        // Jika sudah ada, kemaskini token
        const { error: updateError } = await supabase
          .from('pages')
          .update({
            page_name: page.name,
            access_token: page.access_token,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('page_id', page.id);

        if (updateError) {
          console.error(`Ralat kemaskini page ${page.name}:`, updateError.message);
        }
      } else {
        // Jika belum ada, masukkan rekod baru
        const { error: insertError } = await supabase
          .from('pages')
          .insert({
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token,
            is_active: true,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Ralat masukkan page baru ${page.name}:`, insertError.message);
        }
      }
    }
