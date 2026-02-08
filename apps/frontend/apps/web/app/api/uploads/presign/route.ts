import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { auth } from '@kit/shared/auth';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;
const S3_PUBLIC_BASE_URL =
  process.env.S3_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_S3_PUBLIC_BASE_URL ?? '';

if (!S3_BUCKET_NAME) {
  throw new Error('S3_BUCKET_NAME is not configured.');
}

const PRESIGN_EXPIRATION_SECONDS = 60;

function sanitizeFilename(filename: string) {
  return filename
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9.\-\_ ]/g, '')
    .replace(/\s+/g, '-');
}

export const POST = async (request: Request) => {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        files?: Array<{ name: string; type: string }>;
        path?: string;
        cacheControl?: number;
      }
    | null;

  if (!body?.files?.length) {
    return NextResponse.json(
      { error: 'No files provided for upload.' },
      { status: 400 },
    );
  }

  const safePath = body.path?.replace(/^\/+|\/+$|\.\.+/g, '') ?? 'uploads';

  const uploads = await Promise.all(
    body.files.map(async (file) => {
      const sanitizedName = sanitizeFilename(file.name);
      const objectKey = `${safePath}/${userId}/${Date.now()}-${randomUUID()}-${sanitizedName}`;

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: objectKey,
        ContentType: file.type || 'application/octet-stream',
        CacheControl: body.cacheControl
          ? `max-age=${body.cacheControl}`
          : undefined,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: PRESIGN_EXPIRATION_SECONDS,
      });

      const publicUrl = S3_PUBLIC_BASE_URL
        ? `${S3_PUBLIC_BASE_URL.replace(/\/?$/, '/')}${objectKey}`
        : objectKey;

      return {
        key: objectKey,
        uploadUrl,
        publicUrl,
      };
    }),
  );

  return NextResponse.json({ uploads });
};
