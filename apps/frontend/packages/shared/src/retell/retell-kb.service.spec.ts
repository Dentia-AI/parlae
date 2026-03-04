jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockRetellService = {
  isEnabled: jest.fn().mockReturnValue(true),
  deleteKnowledgeBase: jest.fn(),
  createKnowledgeBase: jest.fn(),
  getKnowledgeBase: jest.fn(),
  waitForKnowledgeBase: jest.fn(),
};

const mockVapiService = {
  getFile: jest.fn(),
};

jest.mock('./retell.service', () => ({
  createRetellService: () => mockRetellService,
}));

jest.mock('../vapi/server', () => ({
  createVapiService: () => mockVapiService,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { syncVapiKBToRetell, ensureRetellKnowledgeBase } from './retell-kb.service';

beforeEach(() => {
  jest.clearAllMocks();
  mockRetellService.isEnabled.mockReturnValue(true);
});

describe('syncVapiKBToRetell', () => {
  it('returns null when Retell is disabled', async () => {
    mockRetellService.isEnabled.mockReturnValue(false);

    const result = await syncVapiKBToRetell('acc-123', ['file-1'], 'Test Clinic');
    expect(result).toBeNull();
  });

  it('returns null when no file IDs provided', async () => {
    const result = await syncVapiKBToRetell('acc-123', [], 'Test Clinic');
    expect(result).toBeNull();
  });

  it('deletes old KB if existingRetellKbId is provided', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'faq.pdf',
      url: 'https://files.vapi.ai/faq.pdf',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      headers: new Map([['content-type', 'application/pdf']]),
    });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-new',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-new',
      status: 'complete',
    });

    const result = await syncVapiKBToRetell('account-1234', ['file-1'], 'Test Clinic', 'kb-old');

    expect(mockRetellService.deleteKnowledgeBase).toHaveBeenCalledWith('kb-old');
    expect(result).toBe('kb-new');
  });

  it('downloads Vapi files and uploads to Retell', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'info.txt',
      url: 'https://files.vapi.ai/info.txt',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(50)),
      headers: { get: () => 'text/plain' },
    });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-1',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-1',
      status: 'complete',
      knowledge_base_sources: [{ source_id: 's1' }],
    });

    const result = await syncVapiKBToRetell('abcdefgh-1234', ['file-1'], 'My Clinic');

    expect(result).toBe('kb-1');
    expect(mockRetellService.createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('kb-'),
        files: expect.any(Array),
      }),
    );
  });

  it('falls back to text snippet when file download fails', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'missing.pdf',
      url: 'https://files.vapi.ai/missing.pdf',
    });

    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-fallback',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-fallback',
      status: 'complete',
    });

    const result = await syncVapiKBToRetell('abcdefgh', ['file-1'], 'Clinic');

    expect(result).toBe('kb-fallback');
    expect(mockRetellService.createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        texts: expect.arrayContaining([
          expect.objectContaining({ title: 'missing.pdf' }),
        ]),
      }),
    );
  });

  it('uses inline content when file has no URL', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'inline-doc',
      content: 'Hello, this is inline content.',
    });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-inline',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-inline',
      status: 'complete',
    });

    const result = await syncVapiKBToRetell('abcdefgh', ['file-1'], 'Clinic');

    expect(result).toBe('kb-inline');
    expect(mockRetellService.createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        texts: expect.arrayContaining([
          expect.objectContaining({
            title: 'inline-doc',
            text: 'Hello, this is inline content.',
          }),
        ]),
      }),
    );
  });

  it('returns null when no files or texts to upload', async () => {
    mockVapiService.getFile.mockResolvedValue({ name: 'empty' });

    const result = await syncVapiKBToRetell('abcdefgh', ['file-1'], 'Clinic');
    expect(result).toBeNull();
  });

  it('returns null when Retell createKnowledgeBase fails', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'doc.txt',
      content: 'text',
    });

    mockRetellService.createKnowledgeBase.mockResolvedValue(null);

    const result = await syncVapiKBToRetell('abcdefgh', ['file-1'], 'Clinic');
    expect(result).toBeNull();
  });

  it('returns null when KB processing results in error', async () => {
    mockVapiService.getFile.mockResolvedValue({
      name: 'doc.txt',
      content: 'text',
    });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-err',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-err',
      status: 'error',
    });

    const result = await syncVapiKBToRetell('abcdefgh', ['file-1'], 'Clinic');
    expect(result).toBeNull();
  });

  it('skips files that fail to fetch metadata', async () => {
    mockVapiService.getFile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'good.txt', content: 'content' });

    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-partial',
      status: 'in_progress',
    });

    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-partial',
      status: 'complete',
    });

    const result = await syncVapiKBToRetell('abcdefgh', ['bad-file', 'good-file'], 'Clinic');
    expect(result).toBe('kb-partial');
  });

  it('continues on delete error for old KB (non-fatal)', async () => {
    mockRetellService.deleteKnowledgeBase.mockRejectedValue(new Error('Not found'));

    mockVapiService.getFile.mockResolvedValue({ name: 'doc', content: 'text' });
    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-after-err',
      status: 'in_progress',
    });
    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-after-err',
      status: 'complete',
    });

    const result = await syncVapiKBToRetell('abcdefgh', ['f1'], 'Clinic', 'old-kb');
    expect(result).toBe('kb-after-err');
  });
});

describe('ensureRetellKnowledgeBase', () => {
  it('returns existing KB ID when it is still valid', async () => {
    mockRetellService.getKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-existing',
      status: 'complete',
    });

    const result = await ensureRetellKnowledgeBase(
      'account-1',
      ['file-1'],
      'Clinic',
      'kb-existing',
    );

    expect(result).toBe('kb-existing');
    expect(mockRetellService.createKnowledgeBase).not.toHaveBeenCalled();
  });

  it('creates new KB when existing one is not found', async () => {
    mockRetellService.getKnowledgeBase.mockRejectedValue(new Error('Not found'));

    mockVapiService.getFile.mockResolvedValue({ name: 'doc', content: 'text' });
    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-new',
      status: 'in_progress',
    });
    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-new',
      status: 'complete',
    });

    const result = await ensureRetellKnowledgeBase(
      'account-1',
      ['file-1'],
      'Clinic',
      'kb-missing',
    );

    expect(result).toBe('kb-new');
  });

  it('creates new KB when no existing ID provided', async () => {
    mockVapiService.getFile.mockResolvedValue({ name: 'doc', content: 'text' });
    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-fresh',
      status: 'in_progress',
    });
    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-fresh',
      status: 'complete',
    });

    const result = await ensureRetellKnowledgeBase('account-1', ['file-1'], 'Clinic');

    expect(result).toBe('kb-fresh');
  });

  it('creates new KB when existing status is not complete', async () => {
    mockRetellService.getKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-stale',
      status: 'error',
    });

    mockVapiService.getFile.mockResolvedValue({ name: 'doc', content: 'text' });
    mockRetellService.createKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-replacement',
      status: 'in_progress',
    });
    mockRetellService.waitForKnowledgeBase.mockResolvedValue({
      knowledge_base_id: 'kb-replacement',
      status: 'complete',
    });

    const result = await ensureRetellKnowledgeBase(
      'account-1',
      ['file-1'],
      'Clinic',
      'kb-stale',
    );

    expect(result).toBe('kb-replacement');
  });
});
