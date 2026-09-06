import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID diperlukan' }, { status: 400 });
    }

    // Ambil senarai Page dan token akses milik user dari Supabase
    const { data: pages, error: pageError } = await supabase
      .from('pages')
      .select('page_id, page_name, access_token')
      .eq('user_id', userId);

    if (pageError) throw pageError;
    if (!pages || pages.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    let allFetchedPosts = [];

    // Gelung setiap Page untuk tarik pos terus dari Graph API Facebook
    for (const page of pages) {
      if (!page.access_token) continue;

      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.page_id}/posts?fields=id,message,created_time,full_picture,permalink_url&access_token=${page.access_token}`
        );
        const fbData = await fbRes.json();

        if (fbData && fbData.data) {
          fbData.data.forEach((p) => {
            allFetchedPosts.push({
              id: p.id,
              page_id: page.page_id,
              page_name: page.page_name,
              message: p.message || '',
              scheduled_at: p.created_time, // Guna waktu pos dicipta
              image_url: p.full_picture || null,
              status: 'published',
              is_external: true, // Penanda bahawa ia pos luar/manual
              permalink_url: p.permalink_url || `https://facebook.com/${p.id}`,
            });
          });
        }
      } catch (err) {
        console.error(`Gagal tarik pos untuk page ${page.page_name}:`, err);
      }
    }

    return NextResponse.json({ posts: allFetchedPosts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
