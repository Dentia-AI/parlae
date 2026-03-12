jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { buildDentalClinicFlow, type ConversationFlowBuildConfig } from './dental-clinic.flow-template';

const BASE_CONFIG: ConversationFlowBuildConfig = {
  clinicName: 'Test Dental',
  clinicPhone: '+15551234567',
  webhookUrl: 'https://api.test.com',
  webhookSecret: 'secret-123',
  accountId: 'acc-test-1',
};

describe('buildDentalClinicFlow', () => {
  it('attaches knowledge_base_ids to receptionist and faq nodes when provided', () => {
    const kbIds = ['kb-abc-123'];
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    const receptionist = flow.nodes.find((n: any) => n.id === 'receptionist');
    const faq = flow.nodes.find((n: any) => n.id === 'faq');

    expect(receptionist).toBeDefined();
    expect((receptionist as any).knowledge_base_ids).toEqual(kbIds);

    expect(faq).toBeDefined();
    expect((faq as any).knowledge_base_ids).toEqual(kbIds);
  });

  it('attaches multiple KB IDs when provided', () => {
    const kbIds = ['kb-1', 'kb-2'];
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    const receptionist = flow.nodes.find((n: any) => n.id === 'receptionist');
    const faq = flow.nodes.find((n: any) => n.id === 'faq');

    expect((receptionist as any).knowledge_base_ids).toEqual(kbIds);
    expect((faq as any).knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT attach knowledge_base_ids when knowledgeBaseIds is undefined', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);

    const receptionist = flow.nodes.find((n: any) => n.id === 'receptionist');
    const faq = flow.nodes.find((n: any) => n.id === 'faq');

    expect(receptionist).toBeDefined();
    expect((receptionist as any).knowledge_base_ids).toBeUndefined();

    expect(faq).toBeDefined();
    expect((faq as any).knowledge_base_ids).toBeUndefined();
  });

  it('does NOT attach knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });

    const receptionist = flow.nodes.find((n: any) => n.id === 'receptionist');
    const faq = flow.nodes.find((n: any) => n.id === 'faq');

    expect((receptionist as any).knowledge_base_ids).toBeUndefined();
    expect((faq as any).knowledge_base_ids).toBeUndefined();
  });

  it('never attaches knowledge_base_ids to non-receptionist/faq nodes', () => {
    const kbIds = ['kb-abc-123'];
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    const nonKbNodeIds = ['booking', 'appt_mgmt', 'patient_records', 'insurance_billing', 'emergency', 'take_message'];

    for (const nodeId of nonKbNodeIds) {
      const node = flow.nodes.find((n: any) => n.id === nodeId);
      if (node) {
        expect((node as any).knowledge_base_ids).toBeUndefined();
      }
    }
  });

  it('always includes receptionist and faq nodes', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const nodeIds = flow.nodes.map((n: any) => n.id);

    expect(nodeIds).toContain('receptionist');
    expect(nodeIds).toContain('faq');
  });

  it('sets start_node_id to receptionist', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('receptionist');
  });
});
