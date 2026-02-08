import { GET } from '../route';

// Mock the backend-api module
jest.mock('~/lib/server/backend-api', () => ({
  fetchBackendStatus: jest.fn(),
}));

import { fetchBackendStatus } from '~/lib/server/backend-api';

const mockFetchBackendStatus = fetchBackendStatus as jest.MockedFunction<typeof fetchBackendStatus>;

describe('/api/test/backend-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return backend status when successful', async () => {
    const mockStatus = {
      message: 'Dentia backend ready',
      database: 'reachable',
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    mockFetchBackendStatus.mockResolvedValue(mockStatus);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: 'Dentia backend ready',
      database: 'reachable',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
  });

  it('should handle backend errors gracefully', async () => {
    mockFetchBackendStatus.mockRejectedValue(new Error('Backend connection failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Backend connection failed',
    });
  });

  it('should handle non-Error exceptions', async () => {
    mockFetchBackendStatus.mockRejectedValue('String error');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Unknown error',
    });
  });

  it('should spread all backend status fields', async () => {
    const mockStatus = {
      message: 'Backend ready',
      database: 'connected',
      timestamp: '2024-01-01T00:00:00.000Z',
      additionalField: 'extra-data',
    };

    mockFetchBackendStatus.mockResolvedValue(mockStatus);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({
      success: true,
      ...mockStatus,
    });
    expect(data.additionalField).toBe('extra-data');
  });

  it('should call fetchBackendStatus once', async () => {
    const mockStatus = {
      message: 'Backend ready',
      database: 'connected',
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    mockFetchBackendStatus.mockResolvedValue(mockStatus);

    await GET();

    expect(mockFetchBackendStatus).toHaveBeenCalledTimes(1);
  });

  it('should return JSON content-type', async () => {
    const mockStatus = {
      message: 'Backend ready',
      database: 'connected',
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    mockFetchBackendStatus.mockResolvedValue(mockStatus);

    const response = await GET();
    const contentType = response.headers.get('content-type');

    expect(contentType).toContain('application/json');
  });

  it('should handle timeout errors', async () => {
    mockFetchBackendStatus.mockRejectedValue(new Error('Request timeout'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('timeout');
  });

  it('should handle network errors', async () => {
    mockFetchBackendStatus.mockRejectedValue(new Error('Network error: fetch failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Network error: fetch failed');
  });
});

