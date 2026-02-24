process.env.S3_BUCKET_NAME = 'test-bucket';

jest.mock('@kit/shared/auth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned'),
}));

import { POST } from '../route';

describe('POST /api/uploads/presign', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return presigned URL', async () => {
    const request = new Request('http://localhost/api/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        files: [{ name: 'test.pdf', type: 'application/pdf' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
