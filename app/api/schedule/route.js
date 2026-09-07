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
    
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: 'Format data JSON tidak sah.' }, { status: 400 });
    }

    const { pageIds, message, imageUrl, videoUrl, firstComment, commentImageUrl, scheduledAt, profile, userId } = body;
    const activeProfile = profile || 'Default';

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'Sila pilih sekurang-kurangnya satu Facebook Page.' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Sesi pengguna tidak sah (User ID tiada).' }, { status: 400 });
    }

    let recordsToInsert = [];

    // Kes 1: Jadual Manual (Array pelbagai masa)
    if (Array.isArray(scheduledAt)) {
      for (const timeStr of scheduledAt) {
        if (!timeStr) continue;
        const formatted = timeStr.endsWith('Z') || timeStr.includes('+') ? timeStr : `${timeStr}:00+08:00`;
        const parsedDate = new Date(formatted);
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json({ error: `Format masa jadual tidak sah: ${timeStr}` }, { status: 400 });
        }
        recordsToInsert.push({
          page_ids: pageIds,
          message: message || '',
          image_url: imageUrl || null,
          video_url: videoUrl || null,
          first_comment: firstComment || null,
          comment_image_url: commentImageUrl || null,
          scheduled_at: parsedDate.toISOString(),
          status: 'pending',
          profile: activeProfile,
          user_id: userId,
        });
      }

      if (recordsToInsert.length === 0) {
        return NextResponse.json({ error: 'Tiada masa jadual manual yang sah diberikan.' }, { status: 400 });
      }
    } 
    // Kes 2: Auto-Queue atau Pos Sekarang / Tunggal
    else {
      let targetScheduledTime = null;

      if (scheduledAt) {
        if (scheduledAt === 'auto-queue') {
          // 1. Ambil pos 'pending' terakhir untuk user & profil ini
          const { data: lastPosts } = await supabase
            .from('scheduled_posts')
            .select('scheduled_at')
            .eq('status', 'pending')
            .eq('profile', activeProfile)
            .eq('user_id', userId)
            .order('scheduled_at', { ascending: false })
            .limit(1);

          // 2. Ambil tetapan queue model Template Grouping (JSON)
          const { data: queueSettings } = await supabase
            .from('queue_settings')
            .select('*')
            .eq('profile', activeProfile)
            .eq('user_id', userId);

          const nowUTC = new Date();
          const localTimeStr = nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
          let nowLocalDate = new Date(localTimeStr);
          let baseDate = new Date(nowLocalDate);

          if (lastPosts && lastPosts.length > 0 && lastPosts[0].scheduled_at) {
            const lastDateUTC = new Date(lastPosts[0].scheduled_at);
            const lastLocalStr = lastDateUTC.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
            const lastDate = new Date(lastLocalStr);
            if (!isNaN(lastDate.getTime()) && lastDate > baseDate) {
              baseDate = lastDate;
              // Tambah 30 minit dari pos terakhir supaya pos seterusnya jatuh pada slot berikutnya
              baseDate.setMinutes(baseDate.getMinutes() + 30);
            }
          }

          let targetHours = 6; // Default fallback pukul 6:00 pagi
          let targetMinutes = 0;

          if (queueSettings && queueSettings.length > 0) {
            // Kumpul semua slot masa daripada semua tatarajah kumpulan
            let allSlots = [];
            queueSettings.forEach(setting => {
              if (Array.isArray(setting.time_slots)) {
                setting.time_slots.forEach(slot => {
                  // slot mempunyai { time: "06:00", days: [1,2,3,4,5,6,0] }
                  if (slot && slot.time && Array.isArray(slot.days)) {
                    slot.days.forEach(dayIdx => {
                      allSlots.push({ day: dayIdx, time: slot.time });
                    });
                  }
                });
              }
            });

            if (allSlots.length > 0) {
              const parseToMinutes = (t) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + (m || 0);
              };

              let currentDayOfWeek = baseDate.getDay();
              let baseMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();

              // Cari slot pada hari yang sama yang lebih lewat daripada baseMinutes
              let todaySlots = allSlots
                .filter(s => s.day === currentDayOfWeek)
                .map(s => ({ ...s, totalMin: parseToMinutes(s.time) }))
                .sort((a, b) => a.totalMin - b.totalMin);

              let foundSlot = todaySlots.find(s => s.totalMin >= baseMinutes);

              // Jika tiada slot berbaki hari ini, ambil slot paling awal untuk hari esok
              if (!foundSlot) {
                baseDate.setDate(baseDate.getDate() + 1);
                baseDate.setHours(0, 0, 0, 0);
                const nextDayOfWeek = baseDate.getDay();

                let tomorrowSlots = allSlots
                  .filter(s => s.day === nextDayOfWeek)
                  .map(s => ({ ...s, totalMin: parseToMinutes(s.time) }))
                  .sort((a, b) => a.totalMin - b.totalMin);

                foundSlot = tomorrowSlots[0] || allSlots[0];
              }

              if (foundSlot && foundSlot.time) {
                const [h, m] = foundSlot.time.split(':').map(Number);
                targetHours = h;
                targetMinutes = m || 0;
              }
            }
          }

          baseDate.setHours(targetHours, targetMinutes, 0, 0);

          const year = baseDate.getFullYear();
          const month = String(baseDate.getMonth() + 1).padStart(2, '0');
          const day = String(baseDate.getDate()).padStart(2, '0');
          const hours = String(baseDate.getHours()).padStart(2, '0');
          const minutes = String(baseDate.getMinutes()).padStart(2, '0');
          const seconds = String(baseDate.getSeconds()).padStart(2, '0');

          targetScheduledTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`;
        } else {
          const formattedScheduledAt = scheduledAt.endsWith('Z') || scheduledAt.includes('+') ? scheduledAt : `${scheduledAt}:00+08:00`;
          const parsedDate = new Date(formattedScheduledAt);
          if (isNaN(parsedDate.getTime())) {
            return NextResponse.json({ error: 'Format masa jadual tidak sah.' }, { status: 400 });
          }
          targetScheduledTime = parsedDate.toISOString();
        }
      } else {
        targetScheduledTime = new Date().toISOString();
      }

      recordsToInsert.push({
        page_ids: pageIds,
        message: message || '',
        image_url: imageUrl || null,
        video_url: videoUrl || null,
        first_comment: firstComment || null,
        comment_image_url: commentImageUrl || null,
        scheduled_at: targetScheduledTime,
        status: 'pending',
        profile: activeProfile,
        user_id: userId,
      });
    }

    const { error: insertError } = await supabase.from('scheduled_posts').insert(recordsToInsert);

    if (insertError) {
      return NextResponse.json({ error: `Gagal menjadualkan pos: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Pos berjaya dijadualkan (${activeProfile})!` }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: error.message || 'Ralat dalaman server.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Kunci Supabase belum ditetapkan.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID pos tidak diberikan.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: `Gagal memadam pos: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Pos berjaya dipadam!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Ralat server.' }, { status: 500 });
  }
}
