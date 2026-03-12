jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { buildPatientCareOutboundFlow, type OutboundFlowBuildConfig } from './patient-care.flow-template';
import { buildFinancialOutboundFlow } from './financial.flow-template';

const BASE_CONFIG: OutboundFlowBuildConfig = {
  clinicName: 'Test Dental',
  clinicPhone: '+15551234567',
  webhookUrl: 'https://api.test.com',
  webhookSecret: 'secret-123',
  accountId: 'acc-test-1',
};

describe('buildPatientCareOutboundFlow', () => {
  it('attaches knowledge_base_ids at flow level when provided', () => {
    const kbIds = ['kb-pc-123'];
    const flow = buildPatientCareOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    expect((flow as any).knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is undefined', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);

    expect((flow as any).knowledge_base_ids).toBeUndefined();
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildPatientCareOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });

    expect((flow as any).knowledge_base_ids).toBeUndefined();
  });

  it('starts at the router node', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('router');
  });
});

describe('buildFinancialOutboundFlow', () => {
  it('attaches knowledge_base_ids at flow level when provided', () => {
    const kbIds = ['kb-fin-456'];
    const flow = buildFinancialOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    expect((flow as any).knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is undefined', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);

    expect((flow as any).knowledge_base_ids).toBeUndefined();
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildFinancialOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });

    expect((flow as any).knowledge_base_ids).toBeUndefined();
  });

  it('starts at the router node', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('router');
  });
});
