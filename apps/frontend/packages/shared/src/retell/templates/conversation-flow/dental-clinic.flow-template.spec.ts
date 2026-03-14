jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const { buildDentalClinicFlow } = require('./dental-clinic.flow-template');

const BASE_CONFIG = {
  clinicName: 'Test Dental',
  clinicPhone: '+15551234567',
  webhookUrl: 'https://api.test.com',
  webhookSecret: 'secret-123',
  accountId: 'acc-test-1',
};

describe('buildDentalClinicFlow', () => {
  // -------------------------------------------------------------------
  // Entry sequence
  // -------------------------------------------------------------------

  it('sets start_node_id to fn_get_context', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('fn_get_context');
  });

  it('fn_get_context is a function node that calls getCallerContext', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const fn = flow.nodes.find((n) => n.id === 'fn_get_context');
    expect(fn).toBeDefined();
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('getCallerContext');
    expect(fn.wait_for_result).toBe(true);
    expect(fn.speak_during_execution).toBe(false);
    expect(fn.else_edge.id).toBe('else_fn_get_context');
    expect(fn.else_edge.destination_node_id).toBe('greeting');
  });

  it('greeting node has 0 tools (KB attached separately when configured)', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const greeting = flow.nodes.find((n) => n.id === 'greeting');
    expect(greeting).toBeDefined();
    expect(greeting.type).toBe('conversation');
    expect(greeting.tool_ids).toBeUndefined();
  });

  it('greeting node routes to booking_collect, appt_mgmt, faq, emergency, end_call', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const greeting = flow.nodes.find((n) => n.id === 'greeting');
    const destinations = greeting.edges.map((e) => e.destination_node_id);
    expect(destinations).toContain('booking_collect');
    expect(destinations).toContain('appt_mgmt');
    expect(destinations).toContain('faq');
    expect(destinations).toContain('emergency');
    expect(destinations).toContain('end_call');
  });

  // -------------------------------------------------------------------
  // Booking sub-flow
  // -------------------------------------------------------------------

  it('includes all booking sub-flow nodes', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const nodeIds = flow.nodes.map((n) => n.id);
    expect(nodeIds).toContain('booking_collect');
    expect(nodeIds).toContain('fn_check_avail');
    expect(nodeIds).toContain('booking_pick_slot');
    expect(nodeIds).toContain('booking_contact');
    expect(nodeIds).toContain('fn_book');
    expect(nodeIds).toContain('booking_done');
    expect(nodeIds).toContain('booking_failed');
  });

  it('booking conversation nodes have 0 tools', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const bookingConvNodeIds = [
      'booking_collect', 'booking_pick_slot', 'booking_contact',
      'booking_done', 'booking_failed',
    ];
    for (const id of bookingConvNodeIds) {
      const node = flow.nodes.find((n) => n.id === id);
      expect(node).toBeDefined();
      expect(node.type).toBe('conversation');
      expect(node.tool_ids).toBeUndefined();
    }
  });

  it('fn_check_avail uses equation edge for success routing', () => {
    const fn = buildDentalClinicFlow(BASE_CONFIG).nodes.find(
      (n) => n.id === 'fn_check_avail',
    );
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('checkAvailability');
    expect(fn.edges[0].transition_condition.type).toBe('equation');
    expect(fn.edges[0].destination_node_id).toBe('booking_pick_slot');
    expect(fn.else_edge.destination_node_id).toBe('booking_failed');
  });

  it('fn_book uses equation edge for success routing', () => {
    const fn = buildDentalClinicFlow(BASE_CONFIG).nodes.find(
      (n) => n.id === 'fn_book',
    );
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('bookAppointment');
    expect(fn.edges[0].transition_condition.type).toBe('equation');
    expect(fn.edges[0].destination_node_id).toBe('booking_done');
    expect(fn.else_edge.destination_node_id).toBe('booking_failed');
  });

  // -------------------------------------------------------------------
  // Hub nodes
  // -------------------------------------------------------------------

  it('includes post_action hub node with 0 tools', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const pa = flow.nodes.find((n) => n.id === 'post_action');
    expect(pa).toBeDefined();
    expect(pa.type).toBe('conversation');
    expect(pa.tool_ids).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // KB scoping
  // -------------------------------------------------------------------

  it('attaches knowledge_base_ids to greeting and faq nodes when provided', () => {
    const kbIds = ['kb-abc-123'];
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });

    const faq = flow.nodes.find((n) => n.id === 'faq');
    expect(faq.knowledge_base_ids).toEqual(kbIds);

    const greeting = flow.nodes.find((n) => n.id === 'greeting');
    expect(greeting.knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT attach knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildDentalClinicFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });
    const faq = flow.nodes.find((n) => n.id === 'faq');
    expect(faq.knowledge_base_ids).toBeUndefined();
    const greeting = flow.nodes.find((n) => n.id === 'greeting');
    expect(greeting.knowledge_base_ids).toBeUndefined();
  });

  it('faq node has getProviders tool', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const faq = flow.nodes.find((n) => n.id === 'faq');
    expect(faq.tool_ids).toContain('getProviders');
  });

  // -------------------------------------------------------------------
  // Appointment management sub-flow
  // -------------------------------------------------------------------

  it('includes all appt_mgmt sub-flow nodes', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const nodeIds = flow.nodes.map((n) => n.id);
    expect(nodeIds).toContain('appt_mgmt');
    expect(nodeIds).toContain('fn_get_appts');
    expect(nodeIds).toContain('appt_cancel');
    expect(nodeIds).toContain('fn_cancel');
    expect(nodeIds).toContain('appt_resched');
    expect(nodeIds).toContain('fn_reschedule');
    expect(nodeIds).toContain('appt_mgmt_done');
    expect(nodeIds).toContain('appt_mgmt_failed');
  });

  it('appt_mgmt entry has only lookupPatient tool', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const entry = flow.nodes.find((n) => n.id === 'appt_mgmt');
    expect(entry.type).toBe('conversation');
    expect(entry.tool_ids).toEqual(['lookupPatient']);
  });

  it('appt_cancel and appt_resched have 0 tools', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    for (const id of ['appt_cancel', 'appt_resched', 'appt_mgmt_done', 'appt_mgmt_failed']) {
      const node = flow.nodes.find((n) => n.id === id);
      expect(node.type).toBe('conversation');
      expect(node.tool_ids).toBeUndefined();
    }
  });

  it('fn_cancel uses equation edge for success routing', () => {
    const fn = buildDentalClinicFlow(BASE_CONFIG).nodes.find(
      (n) => n.id === 'fn_cancel',
    );
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('cancelAppointment');
    expect(fn.edges[0].transition_condition.type).toBe('equation');
    expect(fn.edges[0].destination_node_id).toBe('appt_mgmt_done');
    expect(fn.else_edge.destination_node_id).toBe('appt_mgmt_failed');
  });

  it('fn_reschedule uses equation edge for success routing', () => {
    const fn = buildDentalClinicFlow(BASE_CONFIG).nodes.find(
      (n) => n.id === 'fn_reschedule',
    );
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('rescheduleAppointment');
    expect(fn.edges[0].transition_condition.type).toBe('equation');
    expect(fn.edges[0].destination_node_id).toBe('appt_mgmt_done');
    expect(fn.else_edge.destination_node_id).toBe('appt_mgmt_failed');
  });

  it('fn_get_appts routes to cancel or reschedule via prompt edges', () => {
    const fn = buildDentalClinicFlow(BASE_CONFIG).nodes.find(
      (n) => n.id === 'fn_get_appts',
    );
    expect(fn.type).toBe('function');
    expect(fn.tool_id).toBe('getAppointments');
    const destinations = fn.edges.map((e) => e.destination_node_id);
    expect(destinations).toContain('appt_cancel');
    expect(destinations).toContain('appt_resched');
  });

  // -------------------------------------------------------------------
  // Existing nodes (Phase 3)
  // -------------------------------------------------------------------

  it('emergency node includes lookupPatient, checkAvailability, bookAppointment', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const emergency = flow.nodes.find((n) => n.id === 'emergency');
    expect(emergency).toBeDefined();
    expect(emergency.tool_ids).toContain('lookupPatient');
    expect(emergency.tool_ids).toContain('checkAvailability');
    expect(emergency.tool_ids).toContain('bookAppointment');
  });

  it('patient_records node includes createPatient, lookupPatient, updatePatient', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const pr = flow.nodes.find((n) => n.id === 'patient_records');
    expect(pr).toBeDefined();
    expect(pr.tool_ids).toContain('createPatient');
    expect(pr.tool_ids).toContain('lookupPatient');
    expect(pr.tool_ids).toContain('updatePatient');
  });

  // -------------------------------------------------------------------
  // Global prompt
  // -------------------------------------------------------------------

  it('global prompt includes STAY ON TASK section', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    expect(flow.global_prompt).toContain('STAY ON TASK');
  });

  // -------------------------------------------------------------------
  // Dynamic variables
  // -------------------------------------------------------------------

  it('default_dynamic_variables includes response_variable placeholders', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const vars = flow.default_dynamic_variables;
    expect(vars).toHaveProperty('caller_patient_type');
    expect(vars).toHaveProperty('caller_patient_name');
    expect(vars).toHaveProperty('caller_patient_id');
    expect(vars).toHaveProperty('avail_success');
    expect(vars).toHaveProperty('book_success');
    expect(vars).toHaveProperty('appts_found');
    expect(vars).toHaveProperty('cancel_success');
    expect(vars).toHaveProperty('resched_success');
  });

  // -------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------

  it('getCallerContext tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'getCallerContext');
    expect(tool).toBeDefined();
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.caller_patient_name).toBe('result.patientName');
  });

  it('checkAvailability tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'checkAvailability');
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.avail_success).toBe('result.success');
  });

  it('bookAppointment tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'bookAppointment');
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.book_success).toBe('result.success');
  });

  it('cancelAppointment tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'cancelAppointment');
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.cancel_success).toBe('result.success');
  });

  it('rescheduleAppointment tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'rescheduleAppointment');
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.resched_success).toBe('result.success');
  });

  it('getAppointments tool has response_variables', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const tool = flow.tools.find((t) => t.name === 'getAppointments');
    expect(tool.response_variables).toBeDefined();
    expect(tool.response_variables.appts_found).toBe('result.success');
  });

  // -------------------------------------------------------------------
  // else_edge IDs (required by Retell API)
  // -------------------------------------------------------------------

  it('all else_edges have an id field', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const nodesWithElse = flow.nodes.filter((n) => n.else_edge);
    expect(nodesWithElse.length).toBeGreaterThan(0);
    for (const node of nodesWithElse) {
      expect(node.else_edge.id).toBeDefined();
      expect(typeof node.else_edge.id).toBe('string');
      expect(node.else_edge.id.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------
  // Node layout (Phase 4)
  // -------------------------------------------------------------------

  it('every node has display_position and name', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    for (const node of flow.nodes) {
      expect(node.display_position).toBeDefined();
      expect(typeof node.display_position.x).toBe('number');
      expect(typeof node.display_position.y).toBe('number');
      expect(node.name).toBeDefined();
      expect(node.name.length).toBeGreaterThan(0);
    }
  });

  it('entry nodes are positioned at the top', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const fnCtx = flow.nodes.find((n) => n.id === 'fn_get_context');
    const greet = flow.nodes.find((n) => n.id === 'greeting');
    expect(fnCtx.display_position.y).toBeLessThan(greet.display_position.y);
  });

  it('end_call is positioned at the bottom', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const endCall = flow.nodes.find((n) => n.id === 'end_call');
    const maxNonEndY = Math.max(
      ...flow.nodes.filter((n) => n.id !== 'end_call').map((n) => n.display_position.y),
    );
    expect(endCall.display_position.y).toBeGreaterThan(maxNonEndY);
  });

  it('flow has begin_tag_display_position', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    expect(flow.begin_tag_display_position).toBeDefined();
    expect(flow.begin_tag_display_position.y).toBeLessThan(0);
  });

  it('node names are human-readable', () => {
    const flow = buildDentalClinicFlow(BASE_CONFIG);
    const greeting = flow.nodes.find((n) => n.id === 'greeting');
    expect(greeting.name).toBe('Greeting');
    const fnBook = flow.nodes.find((n) => n.id === 'fn_book');
    expect(fnBook.name).toBe('Book Appointment');
    const endCall = flow.nodes.find((n) => n.id === 'end_call');
    expect(endCall.name).toBe('End Call');
  });
});
