import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  CreatePresignedUploadUrlDto,
  UploadPurpose,
} from './dto/create-presigned-upload-url.dto';

type UploadRule = {
  prefix: string;
  maxSizeBytes: number;
  allowedContentTypes: string[];
};

const UPLOAD_RULES: Record<UploadPurpose, UploadRule> = {
  [UploadPurpose.PRODUCT_IMAGE]: {
    prefix: 'products',
    maxSizeBytes: 5 * 1024 * 1024,
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  [UploadPurpose.AVATAR]: {
    prefix: 'avatars',
    maxSizeBytes: 2 * 1024 * 1024,
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  [UploadPurpose.KYC_DOCUMENT]: {
    prefix: 'kyc',
    maxSizeBytes: 10 * 1024 * 1024,
    allowedContentTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  },
};

@Injectable()
export class UploadService {
  private readonly expiresInSeconds = 5 * 60;
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('r2.region') ?? 'auto',
      endpoint: this.configService.get<string>('r2.endpoint'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.configService.get<string>('r2.accessKeyId') ?? '',
        secretAccessKey:
          this.configService.get<string>('r2.secretAccessKey') ?? '',
      },
    });
  }

  async createPresignedUploadUrl(
    userId: string,
    dto: CreatePresignedUploadUrlDto,
  ) {
    const bucket = this.configService.get<string>('r2.bucketName');

    if (!bucket) {
      throw new ServiceUnavailableException('Upload bucket is not configured');
    }

    this.validateUpload(dto);

    const key = this.createObjectKey(userId, dto);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.expiresInSeconds,
    });

    return {
      message: 'Upload URL created',
      data: {
        key,
        uploadUrl,
        publicUrl: this.createPublicUrl(key),
        method: 'PUT',
        expiresIn: this.expiresInSeconds,
        headers: {
          'Content-Type': dto.contentType,
        },
      },
    };
  }

  private validateUpload(dto: CreatePresignedUploadUrlDto): void {
    const rule = UPLOAD_RULES[dto.purpose];

    if (!rule.allowedContentTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `${dto.contentType} is not allowed for ${dto.purpose}`,
      );
    }

    if (dto.sizeBytes > rule.maxSizeBytes) {
      throw new BadRequestException(
        `File is too large for ${dto.purpose}. Max size is ${rule.maxSizeBytes} bytes`,
      );
    }
  }

  private createObjectKey(
    userId: string,
    dto: CreatePresignedUploadUrlDto,
  ): string {
    const rule = UPLOAD_RULES[dto.purpose];
    const date = new Date().toISOString().slice(0, 10);
    const safeFileName = dto.fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${rule.prefix}/${userId}/${date}/${randomUUID()}-${safeFileName || 'file'}`;
  }

  private createPublicUrl(key: string): string | undefined {
    const publicUrl = this.configService.get<string>('r2.publicUrl');

    if (!publicUrl) {
      return undefined;
    }

    const baseUrl = publicUrl.replace(/\/+$/g, '');
    const encodedKey = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');

    return `${baseUrl}/${encodedKey}`;
  }
}
