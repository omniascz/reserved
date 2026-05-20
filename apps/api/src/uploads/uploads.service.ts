// Sprint 8.2-C — Photo upload (logo, katalog fotky).
//
// Strategie:
//   - Production: S3 / Cloudflare R2 přes presigned PUT URL
//   - Dev: lokální disk fallback (apps/api/uploads/, slouženo statisticky)
//
// Frontend flow:
//   1. POST /admin/uploads/sign  { kind: 'logo' | 'catalog-photo', contentType: 'image/jpeg' }
//      → { uploadUrl, publicUrl, fields? }
//   2. PUT (presigned) → upload file binary
//   3. URL `publicUrl` je co se uloží do tenant.theme.logoUrl atd.
//
// Env vars (volitelne — bez nich se použije local mode):
//   S3_ENDPOINT       https://<accountid>.r2.cloudflarestorage.com  (R2) nebo URL S3
//   S3_REGION         'auto' pro R2, 'eu-central-1' pro AWS
//   S3_BUCKET         název bucketu
//   S3_ACCESS_KEY     access key ID
//   S3_SECRET_KEY     secret access key
//   S3_PUBLIC_BASE    veřejný base URL bucketu (např. https://images.reserved.cz)

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_KINDS = ['logo', 'catalog-photo', 'service-image'] as const;
type UploadKind = (typeof ALLOWED_KINDS)[number];

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadSignResult {
  /** PUT URL kam frontend nahraje binární data (kraťi platnost ~5 min). */
  uploadUrl: string;
  /** Veřejná URL kterou tenant uloží do svého theme / katalog profile. */
  publicUrl: string;
  /** Pole storage backendu (s3 | local). */
  storage: 's3' | 'local';
  /** Volitelně HTTP method pro upload (default PUT). */
  method?: 'PUT' | 'POST';
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string | null = null;
  private readonly publicBase: string | null = null;
  /** Pokud false, používame lokální disk fallback (pouze dev). */
  private readonly usesS3: boolean = false;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const region = config.get<string>('S3_REGION');
    const bucket = config.get<string>('S3_BUCKET');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    const publicBase = config.get<string>('S3_PUBLIC_BASE');

    if (endpoint && region && bucket && accessKeyId && secretAccessKey && publicBase) {
      this.s3Client = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
      this.bucket = bucket;
      this.publicBase = publicBase.replace(/\/$/, '');
      this.usesS3 = true;
      this.logger.log(`Uploads: S3-compatible (${endpoint}, bucket=${bucket})`);
    } else {
      this.logger.warn('Uploads: S3 not configured — using local disk fallback (dev only).');
    }
  }

  async signUpload(
    tenantId: string,
    kind: string,
    contentType: string,
    fileSize?: number,
  ): Promise<UploadSignResult> {
    if (!ALLOWED_KINDS.includes(kind as UploadKind)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_UPLOAD_KIND',
          message: `kind musí být jedno z: ${ALLOWED_KINDS.join(', ')}`,
        },
      });
    }
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: `Podporované formáty: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        },
      });
    }
    if (fileSize !== undefined && fileSize > MAX_SIZE_BYTES) {
      throw new BadRequestException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Max velikost je ${MAX_SIZE_BYTES / 1024 / 1024} MB.`,
        },
      });
    }

    const ext = this.extFromContentType(contentType);
    const key = `tenants/${tenantId}/${kind}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;

    if (this.usesS3 && this.s3Client && this.bucket && this.publicBase) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 300 }); // 5 min
      return {
        uploadUrl,
        publicUrl: `${this.publicBase}/${key}`,
        storage: 's3',
        method: 'PUT',
      };
    }

    // Local fallback — endpoint /admin/uploads/local/:key přijme PUT
    return {
      uploadUrl: `${this.getApiBaseUrl()}/admin/uploads/local/${encodeURIComponent(key)}`,
      publicUrl: `${this.getApiBaseUrl()}/uploads/${key}`,
      storage: 'local',
      method: 'PUT',
    };
  }

  async saveLocal(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException({
        error: { code: 'INVALID_CONTENT_TYPE', message: 'Nepodporovaný formát.' },
      });
    }
    if (body.length > MAX_SIZE_BYTES) {
      throw new BadRequestException({
        error: { code: 'FILE_TOO_LARGE', message: `Max ${MAX_SIZE_BYTES} bytes.` },
      });
    }
    // Validace cesty (anti path traversal)
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
      throw new BadRequestException({
        error: { code: 'INVALID_KEY', message: 'Neplatný klíč.' },
      });
    }
    const localDir = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
    const fullPath = join(localDir, key);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, body);
  }

  private getApiBaseUrl(): string {
    return process.env.API_URL ?? 'http://localhost:4000';
  }

  private extFromContentType(contentType: string): string {
    return (
      {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      }[contentType] ?? 'bin'
    );
  }
}
