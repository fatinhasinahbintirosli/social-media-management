import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Kunci Supabase belum ditetapkan.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await request.json();
    const { userId, profile, selectedPages, rows } = body;

    if (!userId || !profile || !selectedPages || selectedPages.length === 0) {
      return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
    }

    const sortedRows = [...rows].sort((a, b) => a.time.localeCompare(b.time));

    // Padam rekod lama untuk semua page yang terlibat secara serentak
    await supabase
      .from('queue_settings')
      .delete()
      .eq('profile', profile)
      .eq('user_id', userId)
      .in('page_id', selectedPages);

    // Kumpul semua data untuk dimasukkan
    const allInsertData = [];
    selectedPages.forEach(pageId => {
      sortedRows.forEach(row => {
        row.days.forEach(day => {
          allInsertData.push({
            day_of_week: day,
            time_slot: `${row.time}:00`,
            is_active: true,
            profile: profile,
            user_id: userId,
            page_id: pageId
          });
        });
      });
    });

    // Masukkan dalam kelompok 200 rekod untuk elak had saiz
    const batchSize = 200;
    for (let i = 0; i < allInsertData.length; i += batchSize) {
      const batch = allInsertData.slice(i, i + batchSize);
      const { error: insertError } = await supabase.from('queue_settings').insert(batch);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Berjaya disimpan!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Ralat server.' }, { status: 500 });
  }
}
