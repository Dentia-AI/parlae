import { POST } from '../route';

describe('/api/test/echo', () => {
  it('should echo message back with metadata', async () => {
    const message = 'Hello, frontend!';
    const timestamp = new Date().toISOString();

    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, timestamp }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('echo', message);
    expect(data).toHaveProperty('receivedAt');
    expect(data).toHaveProperty('sentAt', timestamp);
    expect(data).toHaveProperty('frontend', 'Next.js API Route');
  });

  it('should handle message without timestamp', async () => {
    const message = 'Test message';

    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('echo', message);
    expect(data).toHaveProperty('receivedAt');
    expect(data.sentAt).toBeUndefined();
  });

  it('should return valid ISO timestamp for receivedAt', async () => {
    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'test' }),
    });

    const before = Date.now();
    const response = await POST(request);
    const after = Date.now();
    const data = await response.json();

    const receivedTime = new Date(data.receivedAt).getTime();
    expect(receivedTime).toBeGreaterThanOrEqual(before);
    expect(receivedTime).toBeLessThanOrEqual(after);

    // Validate ISO format
    expect(new Date(data.receivedAt).toISOString()).toBe(data.receivedAt);
  });

  it('should handle invalid JSON gracefully', async () => {
    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toHaveProperty('success', false);
    expect(data).toHaveProperty('error');
  });

  it('should handle empty request body', async () => {
    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('receivedAt');
  });

  it('should include all expected metadata fields', async () => {
    const request = new Request('http://localhost:3000/api/test/echo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'test', timestamp: '2024-01-01T00:00:00.000Z' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('echo');
    expect(data).toHaveProperty('receivedAt');
    expect(data).toHaveProperty('sentAt');
    expect(data).toHaveProperty('frontend');
    expect(typeof data.success).toBe('boolean');
    expect(typeof data.echo).toBe('string');
    expect(typeof data.receivedAt).toBe('string');
    expect(typeof data.frontend).toBe('string');
  });
});

