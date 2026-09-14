import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(req) {
  try {
    const { fileName, fileType } = await req.json();

    if (!fileName) {
      return NextResponse.json({ error: 'Nama fail diperlukan.' }, { status: 400 });
    }

    const fileExt = fileName.split('.').pop();
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: fileType || 'application/octet-stream',
    });

    // Jana pautan khas yang sah selama 5 minit
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 300 });
    const publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${uniqueFileName}`;

    return NextResponse.json({ success: true, uploadUrl, publicUrl });
  } catch (err) {
    console.error('Ralat Presigned URL:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
