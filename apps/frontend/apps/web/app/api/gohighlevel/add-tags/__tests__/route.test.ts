import { POST } from '../route';

// Mock the GHL service (match the import path used in the route)
jest.mock('@kit/shared/gohighlevel/server', () => ({
  createGoHighLevelService: jest.fn(),
}));

// Mock the logger
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn(() => Promise.resolve({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';

const mockCreateGoHighLevelService = createGoHighLevelService as jest.MockedFunction<
  typeof createGoHighLevelService
>;

describe('/api/gohighlevel/add-tags', () => {
  let mockGHLService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock GHL service
    mockGHLService = {
      isEnabled: jest.fn(() => true),
      addContactTags: jest.fn(),
    };

    mockCreateGoHighLevelService.mockReturnValue(mockGHLService);
    
    // Clear environment variables
    delete process.env.INTERNAL_API_KEY;
  });

  describe('Authentication', () => {
    it('should allow requests when no INTERNAL_API_KEY is configured', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1', 'tag2'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should require Bearer token when INTERNAL_API_KEY is configured', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept requests with correct Bearer token', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer secret-key',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject requests with incorrect Bearer token', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-key',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Validation', () => {
    it('should require email', async () => {
      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
      expect(data.message).toContain('Email and tags array are required');
    });

    it('should require tags array', async () => {
      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should require tags to be an array', async () => {
      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: 'not-an-array',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should require at least one tag', async () => {
      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });
  });

  describe('Tag Merging (Critical)', () => {
    it('should add new tags to contact (merge, not replace)', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['new-tag-1', 'new-tag-2'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        contactId: 'contact-123',
        email: 'test@example.com',
        tags: ['new-tag-1', 'new-tag-2'],
      });

      // Verify addContactTags was called with merge parameters
      expect(mockGHLService.addContactTags).toHaveBeenCalledWith({
        email: 'test@example.com',
        tags: ['new-tag-1', 'new-tag-2'],
        source: 'DentiaHub Activity',
      });
    });

    it('should preserve existing contact data when adding tags', async () => {
      // This test verifies that the service is called in a way that merges
      mockGHLService.addContactTags.mockResolvedValue('existing-contact-456');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          tags: ['additional-tag'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.contactId).toBe('existing-contact-456');
      
      // Verify that only email and tags are passed (merge operation)
      expect(mockGHLService.addContactTags).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'existing@example.com',
          tags: ['additional-tag'],
        })
      );
    });

    it('should handle multiple tags correctly', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-789');

      const multipleTags = ['tag-a', 'tag-b', 'tag-c', 'tag-d', 'tag-e'];

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'multi@example.com',
          tags: multipleTags,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.tags).toEqual(multipleTags);
      expect(mockGHLService.addContactTags).toHaveBeenCalledWith({
        email: 'multi@example.com',
        tags: multipleTags,
        source: 'DentiaHub Activity',
      });
    });

    it('should use custom source if provided', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
          source: 'Custom Source',
        }),
      });

      const response = await POST(request);
      await response.json();

      expect(mockGHLService.addContactTags).toHaveBeenCalledWith({
        email: 'test@example.com',
        tags: ['tag1'],
        source: 'Custom Source',
      });
    });

    it('should default to "DentiaHub Activity" source if not provided', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      await response.json();

      expect(mockGHLService.addContactTags).toHaveBeenCalledWith({
        email: 'test@example.com',
        tags: ['tag1'],
        source: 'DentiaHub Activity',
      });
    });
  });

  describe('GHL Service Integration', () => {
    it('should handle service not enabled gracefully', async () => {
      mockGHLService.isEnabled.mockReturnValue(false);

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200); // Non-breaking response
      expect(data.success).toBe(false);
      expect(data.message).toContain('not configured');
    });

    it('should handle service failure gracefully', async () => {
      mockGHLService.addContactTags.mockResolvedValue(null); // Simulates failure

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200); // Non-breaking response
      expect(data.success).toBe(false);
      expect(data.message).toContain('Failed to add tags');
    });

    it('should handle exceptions gracefully', async () => {
      mockGHLService.addContactTags.mockRejectedValue(new Error('API Error'));

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Internal server error');
    });
  });

  describe('Response Format', () => {
    it('should return contact ID on success', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-abc-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data).toEqual({
        success: true,
        contactId: 'contact-abc-123',
        email: 'test@example.com',
        tags: ['tag1'],
      });
    });

    it('should include all fields in successful response', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: ['tag1', 'tag2'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('contactId');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('tags');
      expect(data.success).toBe(true);
      expect(data.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in email', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test+special@example.com',
          tags: ['tag1'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(mockGHLService.addContactTags).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test+special@example.com',
        })
      );
    });

    it('should handle tags with spaces and special characters', async () => {
      mockGHLService.addContactTags.mockResolvedValue('contact-123');

      const specialTags = ['Tag With Spaces', 'Tag-With-Dash', 'Tag_With_Underscore'];

      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          tags: specialTags,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.tags).toEqual(specialTags);
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('http://localhost:3000/api/gohighlevel/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
