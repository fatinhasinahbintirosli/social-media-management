import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${origin}/scheduler?status=error&message=${encodeURIComponent(error || 'No code provided')}`);
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const userAccessToken = tokenData.access_token;

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    for (const page of pages) {
      const { data: existingPage } = await supabase
        .from('pages')
        .select('id')
        .eq('page_id', page.id)
        .maybeSingle();

      if (existingPage) {
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

    return NextResponse.redirect(`${origin}/scheduler?status=success`);

  } catch (err) {
    console.error('Facebook Auth Callback Error:', err.message);
    return NextResponse.redirect(`${origin}/scheduler?status=error&message=${encodeURIComponent(err.message)}`);
  }
}
