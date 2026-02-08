import { GET } from '../route';

describe('/api/health', () => {
  it('should return status ok', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: 'ok' });
  });

  it('should return valid JSON response', async () => {
    const response = await GET();
    const contentType = response.headers.get('content-type');

    expect(contentType).toContain('application/json');
  });

  it('should be callable multiple times', async () => {
    const response1 = await GET();
    const response2 = await GET();
    const data1 = await response1.json();
    const data2 = await response2.json();

    expect(data1).toEqual(data2);
    expect(data1).toEqual({ status: 'ok' });
  });

  it('should return 200 status code', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });
});

