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

    // Ambil data page menggunakan struktur lajur yang standard
    const { data: pages, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId);

    if (pageError) throw pageError;
    if (!pages || pages.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    let allFetchedPosts = [];

    for (const page of pages) {
      // Sesuaikan nama lajur mengikut database anda (cth: page_id atau id, page_name atau name)
      const pageId = page.page_id || page.id;
      const pageName = page.page_name || page.name || 'Facebook Page';
      const accessToken = page.access_token || page.token;

      if (!accessToken || !pageId) continue;

      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url&access_token=${accessToken}`
        );
        const fbData = await fbRes.json();

        if (fbData && fbData.data) {
          fbData.data.forEach((p) => {
            allFetchedPosts.push({
              id: p.id,
              page_id: pageId,
              page_name: pageName,
              message: p.message || '',
              scheduled_at: p.created_time,
              image_url: p.full_picture || null,
              status: 'published',
              is_external: true,
              permalink_url: p.permalink_url || `https://facebook.com/${p.id}`,
            });
          });
        }
      } catch (err) {
        console.error(`Gagal tarik pos untuk page ${pageName}:`, err);
      }
    }

    return NextResponse.json({ posts: allFetchedPosts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
