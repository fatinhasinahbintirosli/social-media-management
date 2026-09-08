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
    // Kes 2: Auto-Queue
    else {
      let targetScheduledTime = null;

      if (scheduledAt) {
        if (scheduledAt === 'auto-queue') {
          // 1. Ambil SEMUA pos 'pending' yang akan datang untuk user & profil ini, disusun secara menaik (ascending)
          const { data: pendingPosts } = await supabase
            .from('scheduled_posts')
            .select('scheduled_at')
            .eq('status', 'pending')
            .eq('profile', activeProfile)
            .eq('user_id', userId)
            .order('scheduled_at', { ascending: true });

          // 2. Ambil tetapan queue model Template Grouping (JSON)
          const { data: queueSettings } = await supabase
            .from('queue_settings')
            .select('*')
            .eq('profile', activeProfile)
            .eq('user_id', userId);

          const nowUTC = new Date();
          const localTimeStr = nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
          let baseDate = new Date(localTimeStr);

          // Kumpul semua slot masa daripada semua tatarajah kumpulan
          let allSlots = [];
          if (queueSettings && queueSettings.length > 0) {
            queueSettings.forEach(setting => {
              if (Array.isArray(setting.time_slots)) {
                setting.time_slots.forEach(slot => {
                  if (slot && slot.time && Array.isArray(slot.days)) {
                    slot.days.forEach(dayIdx => {
                      allSlots.push({ day: dayIdx, time: slot.time });
                    });
                  }
                });
              }
            });
          }

          const parseToMinutes = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + (m || 0);
          };

          let foundSlotDate = null;

          // Semak sama ada terdapat slot yang diletakkan dalam masa hadapan (bermula dari masa sekarang)
          if (allSlots.length > 0) {
            // Kita semak untuk beberapa hari ke hadapan (maksimum 7 hari) untuk mencari slot kosong pertama
            let checkDate = new Date(baseDate);
            
            for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
              let currentDayOfWeek = checkDate.getDay();
              let isToday = (dayOffset === 0);
              let baseMinutes = isToday ? (baseDate.getHours() * 60 + baseDate.getMinutes()) : 0;

              // Ambil semua slot pada hari tersebut dan susun ikut masa pagi ke malam
              let daySlots = allSlots
                .filter(s => s.day === currentDayOfWeek)
                .map(s => ({ ...s, totalMin: parseToMinutes(s.time) }))
                .sort((a, b) => a.totalMin - b.totalMin);

              for (const slot of daySlots) {
                // Abaikan slot yang sudah lepas untuk hari ini
                if (isToday && slot.totalMin <= baseMinutes) continue;

                // Bina tarikh & masa penuh untuk slot ini
                let candidateDate = new Date(checkDate);
                const [h, m] = slot.time.split(':').map(Number);
                candidateDate.setHours(h, m || 0, 0, 0);

                // Semak sama ada slot ini sudah diambil oleh pos 'pending' yang lain
                let isOccupied = false;
                if (pendingPosts && pendingPosts.length > 0) {
                  isOccupied = pendingPosts.some(post => {
                    const postDate = new Date(post.scheduled_at);
                    // Bandingkan beza masa dalam minit (jika kurang daripada 5 minit, anggap slot sudah bertindih/diambil)
                    return Math.abs(postDate.getTime() - candidateDate.getTime()) < 5 * 60 * 1000;
                  });
                }

                // Jika slot ini KOSONG (tiada pos mendudukinya), pilih slot ini!
                if (!isOccupied) {
                  foundSlotDate = candidateDate;
                  break;
                }
              }

              if (foundSlotDate) break;

              // Jika tiada slot kosong pada hari ini, beralih ke hari esok
              checkDate.setDate(checkDate.getDate() + 1);
              checkDate.setHours(0, 0, 0, 0);
            }
          }

          // Jika tiada slot kosong dijumpai melalui templat, guna kaedah fallback pos terakhir atau masa sekarang
          if (!foundSlotDate) {
            if (pendingPosts && pendingPosts.length > 0) {
              const lastPostDate = new Date(pendingPosts[pendingPosts.length - 1].scheduled_at);
              const lastLocalStr = lastPostDate.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
              foundSlotDate = new Date(lastLocalStr);
              foundSlotDate.setMinutes(foundSlotDate.getMinutes() + 30);
            } else {
              foundSlotDate = baseDate;
              foundSlotDate.setMinutes(foundSlotDate.getMinutes() + 10);
            }
          }

          const year = foundSlotDate.getFullYear();
          const month = String(foundSlotDate.getMonth() + 1).padStart(2, '0');
          const day = String(foundSlotDate.getDate()).padStart(2, '0');
          const hours = String(foundSlotDate.getHours()).padStart(2, '0');
          const minutes = String(foundSlotDate.getMinutes()).padStart(2, '0');
          const seconds = String(foundSlotDate.getSeconds()).padStart(2, '0');

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
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
