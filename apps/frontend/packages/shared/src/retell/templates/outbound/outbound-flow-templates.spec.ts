jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const { buildPatientCareOutboundFlow, OUTBOUND_PATIENT_CARE_FLOW_VERSION } = require('./patient-care.flow-template');
const { buildFinancialOutboundFlow, OUTBOUND_FINANCIAL_FLOW_VERSION } = require('./financial.flow-template');

const BASE_CONFIG = {
  clinicName: 'Test Dental',
  clinicPhone: '+15551234567',
  webhookUrl: 'https://api.test.com',
  webhookSecret: 'secret-123',
  accountId: 'acc-test-1',
};

// =========================================================================
// Patient Care Outbound Flow
// =========================================================================

describe('buildPatientCareOutboundFlow', () => {
  // -------------------------------------------------------------------
  // Basic structure
  // -------------------------------------------------------------------

  it('starts at the router node', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('router');
  });

  it('has version ob-pc-v2.0', () => {
    expect(OUTBOUND_PATIENT_CARE_FLOW_VERSION).toBe('ob-pc-v2.0');
  });

  it('attaches knowledge_base_ids at flow level when provided', () => {
    const kbIds = ['kb-pc-123'];
    const flow = buildPatientCareOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });
    expect(flow.knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is undefined', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    expect(flow.knowledge_base_ids).toBeUndefined();
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildPatientCareOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });
    expect(flow.knowledge_base_ids).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Router + Call-type nodes
  // -------------------------------------------------------------------

  it('router has equation edges for all 9 call types', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const router = flow.nodes.find((n) => n.id === 'router');
    expect(router).toBeDefined();
    expect(router.edges.length).toBe(9);
    const destIds = router.edges.map((e) => e.destination_node_id);
    expect(destIds).toContain('recall_node');
    expect(destIds).toContain('reminder_node');
    expect(destIds).toContain('followup_node');
    expect(destIds).toContain('noshow_node');
    expect(destIds).toContain('treatment_plan_node');
    expect(destIds).toContain('postop_node');
    expect(destIds).toContain('reactivation_node');
    expect(destIds).toContain('survey_node');
    expect(destIds).toContain('welcome_node');
  });

  it('call-type nodes (except reminder, treatment_plan) have no scheduling tool_ids', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const noToolNodes = ['recall_node', 'noshow_node', 'followup_node', 'postop_node', 'reactivation_node', 'survey_node', 'welcome_node'];
    const schedulingTools = ['checkAvailability', 'bookAppointment', 'lookupPatient', 'getAppointments', 'rescheduleAppointment', 'cancelAppointment'];
    for (const id of noToolNodes) {
      const node = flow.nodes.find((n) => n.id === id);
      expect(node).toBeDefined();
      const tools = node.tool_ids || [];
      for (const tool of schedulingTools) {
        expect(tools).not.toContain(tool);
      }
    }
  });

  it('reminder_node retains reschedule/cancel tool_ids for existing appointments', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const reminder = flow.nodes.find((n) => n.id === 'reminder_node');
    expect(reminder).toBeDefined();
    expect(reminder.tool_ids).toContain('rescheduleAppointment');
    expect(reminder.tool_ids).toContain('cancelAppointment');
  });

  it('treatment_plan_node retains verifyInsuranceCoverage tool_id', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const tp = flow.nodes.find((n) => n.id === 'treatment_plan_node');
    expect(tp).toBeDefined();
    expect(tp.tool_ids).toEqual(['verifyInsuranceCoverage']);
  });

  it('call-type nodes route to ob_booking_collect for scheduling', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const callTypeNodeIds = ['recall_node', 'noshow_node', 'reactivation_node', 'welcome_node'];
    for (const id of callTypeNodeIds) {
      const node = flow.nodes.find((n) => n.id === id);
      const bookEdge = node.edges.find((e) => e.destination_node_id === 'ob_booking_collect');
      expect(bookEdge).toBeDefined();
    }
  });

  // -------------------------------------------------------------------
  // Booking sub-flow
  // -------------------------------------------------------------------

  it('contains all 6 booking sub-flow nodes', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const bookingIds = ['ob_booking_collect', 'fn_check_avail', 'ob_booking_pick_slot', 'fn_book', 'ob_booking_done', 'ob_booking_failed'];
    for (const id of bookingIds) {
      expect(flow.nodes.find((n) => n.id === id)).toBeDefined();
    }
  });

  it('fn_check_avail is a function node calling checkAvailability', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_check_avail');
    expect(node.type).toBe('function');
    expect(node.tool_id).toBe('checkAvailability');
    expect(node.wait_for_result).toBe(true);
  });

  it('fn_book is a function node calling bookAppointment', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_book');
    expect(node.type).toBe('function');
    expect(node.tool_id).toBe('bookAppointment');
    expect(node.wait_for_result).toBe(true);
  });

  it('fn_check_avail routes on avail_success via equation edge', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_check_avail');
    const eqEdge = node.edges.find((e) => e.transition_condition.type === 'equation');
    expect(eqEdge).toBeDefined();
    expect(eqEdge.destination_node_id).toBe('ob_booking_pick_slot');
    const eq = eqEdge.transition_condition.equations[0];
    expect(eq.left).toBe('{{avail_success}}');
    expect(eq.right).toBe('true');
  });

  it('fn_book routes on book_success via equation edge', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_book');
    const eqEdge = node.edges.find((e) => e.transition_condition.type === 'equation');
    expect(eqEdge).toBeDefined();
    expect(eqEdge.destination_node_id).toBe('ob_booking_done');
    const eq = eqEdge.transition_condition.equations[0];
    expect(eq.left).toBe('{{book_success}}');
    expect(eq.right).toBe('true');
  });

  it('fn_check_avail else_edge goes to ob_booking_failed', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_check_avail');
    expect(node.else_edge.destination_node_id).toBe('ob_booking_failed');
  });

  it('fn_book else_edge goes to ob_booking_failed', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_book');
    expect(node.else_edge.destination_node_id).toBe('ob_booking_failed');
  });

  it('ob_booking_failed allows retry back to ob_booking_collect', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'ob_booking_failed');
    const retryEdge = node.edges.find((e) => e.destination_node_id === 'ob_booking_collect');
    expect(retryEdge).toBeDefined();
  });

  // -------------------------------------------------------------------
  // Response variables + dynamic variables
  // -------------------------------------------------------------------

  it('tools include response_variables (checkAvailability, bookAppointment)', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const checkAvail = flow.tools.find((t) => t.name === 'checkAvailability');
    expect(checkAvail.response_variables).toBeDefined();
    const book = flow.tools.find((t) => t.name === 'bookAppointment');
    expect(book.response_variables).toBeDefined();
  });

  it('default_dynamic_variables include response variable placeholders', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const dvars = flow.default_dynamic_variables;
    expect(dvars).toHaveProperty('avail_success');
    expect(dvars).toHaveProperty('avail_message');
    expect(dvars).toHaveProperty('book_success');
    expect(dvars).toHaveProperty('book_message');
  });

  // -------------------------------------------------------------------
  // else_edge IDs
  // -------------------------------------------------------------------

  it('all else_edges have an id field', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const nodesWithElse = flow.nodes.filter((n) => n.else_edge);
    expect(nodesWithElse.length).toBeGreaterThan(0);
    for (const node of nodesWithElse) {
      expect(node.else_edge.id).toBeDefined();
      expect(typeof node.else_edge.id).toBe('string');
    }
  });

  // -------------------------------------------------------------------
  // Global prompt
  // -------------------------------------------------------------------

  it('global prompt includes STAY ON TASK directive', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    expect(flow.global_prompt).toContain('STAY ON TASK');
  });

  // -------------------------------------------------------------------
  // Visual layout
  // -------------------------------------------------------------------

  it('all nodes have display_position and name', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    for (const node of flow.nodes) {
      expect(node.display_position).toBeDefined();
      expect(typeof node.display_position.x).toBe('number');
      expect(typeof node.display_position.y).toBe('number');
      expect(node.name).toBeDefined();
      expect(typeof node.name).toBe('string');
    }
  });

  it('router node is at the top (y=0)', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const router = flow.nodes.find((n) => n.id === 'router');
    expect(router.display_position.y).toBe(0);
  });

  it('end_call node is at the bottom', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const endCall = flow.nodes.find((n) => n.id === 'end_call');
    const maxY = Math.max(...flow.nodes.filter((n) => n.type !== 'end' || n.id === 'end_call').map((n) => n.display_position.y));
    expect(endCall.display_position.y).toBe(maxY);
  });

  it('has begin_tag_display_position', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    expect(flow.begin_tag_display_position).toBeDefined();
    expect(flow.begin_tag_display_position.x).toBe(0);
    expect(flow.begin_tag_display_position.y).toBe(-100);
  });

  // -------------------------------------------------------------------
  // No old booking_node
  // -------------------------------------------------------------------

  it('does not contain the old monolithic booking_node', () => {
    const flow = buildPatientCareOutboundFlow(BASE_CONFIG);
    const old = flow.nodes.find((n) => n.id === 'booking_node');
    expect(old).toBeUndefined();
  });
});

// =========================================================================
// Financial Outbound Flow
// =========================================================================

describe('buildFinancialOutboundFlow', () => {
  // -------------------------------------------------------------------
  // Basic structure
  // -------------------------------------------------------------------

  it('starts at the router node', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    expect(flow.start_node_id).toBe('router');
  });

  it('has version ob-fin-v2.0', () => {
    expect(OUTBOUND_FINANCIAL_FLOW_VERSION).toBe('ob-fin-v2.0');
  });

  it('attaches knowledge_base_ids at flow level when provided', () => {
    const kbIds = ['kb-fin-456'];
    const flow = buildFinancialOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: kbIds });
    expect(flow.knowledge_base_ids).toEqual(kbIds);
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is undefined', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    expect(flow.knowledge_base_ids).toBeUndefined();
  });

  it('does NOT include knowledge_base_ids when knowledgeBaseIds is empty', () => {
    const flow = buildFinancialOutboundFlow({ ...BASE_CONFIG, knowledgeBaseIds: [] });
    expect(flow.knowledge_base_ids).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Router + Call-type nodes
  // -------------------------------------------------------------------

  it('router has equation edges for payment and benefits', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const router = flow.nodes.find((n) => n.id === 'router');
    expect(router).toBeDefined();
    const destIds = router.edges.map((e) => e.destination_node_id);
    expect(destIds).toContain('payment_node');
    expect(destIds).toContain('benefits_node');
  });

  it('benefits_node does not have scheduling tool_ids', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const benefits = flow.nodes.find((n) => n.id === 'benefits_node');
    expect(benefits.tool_ids).not.toContain('checkAvailability');
    expect(benefits.tool_ids).not.toContain('bookAppointment');
  });

  it('benefits_node retains insurance tool_ids', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const benefits = flow.nodes.find((n) => n.id === 'benefits_node');
    expect(benefits.tool_ids).toContain('getInsurance');
    expect(benefits.tool_ids).toContain('verifyInsuranceCoverage');
    expect(benefits.tool_ids).toContain('lookupPatient');
  });

  it('benefits_node routes to ob_booking_collect for scheduling', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const benefits = flow.nodes.find((n) => n.id === 'benefits_node');
    const bookEdge = benefits.edges.find((e) => e.destination_node_id === 'ob_booking_collect');
    expect(bookEdge).toBeDefined();
  });

  // -------------------------------------------------------------------
  // Booking sub-flow
  // -------------------------------------------------------------------

  it('contains all 6 booking sub-flow nodes', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const bookingIds = ['ob_booking_collect', 'fn_check_avail', 'ob_booking_pick_slot', 'fn_book', 'ob_booking_done', 'ob_booking_failed'];
    for (const id of bookingIds) {
      expect(flow.nodes.find((n) => n.id === id)).toBeDefined();
    }
  });

  it('fn_check_avail is a function node calling checkAvailability', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_check_avail');
    expect(node.type).toBe('function');
    expect(node.tool_id).toBe('checkAvailability');
  });

  it('fn_book is a function node calling bookAppointment', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_book');
    expect(node.type).toBe('function');
    expect(node.tool_id).toBe('bookAppointment');
  });

  it('fn_check_avail routes on avail_success via equation edge', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_check_avail');
    const eqEdge = node.edges.find((e) => e.transition_condition.type === 'equation');
    expect(eqEdge).toBeDefined();
    expect(eqEdge.destination_node_id).toBe('ob_booking_pick_slot');
  });

  it('fn_book routes on book_success via equation edge', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const node = flow.nodes.find((n) => n.id === 'fn_book');
    const eqEdge = node.edges.find((e) => e.transition_condition.type === 'equation');
    expect(eqEdge).toBeDefined();
    expect(eqEdge.destination_node_id).toBe('ob_booking_done');
  });

  // -------------------------------------------------------------------
  // Response variables + dynamic variables
  // -------------------------------------------------------------------

  it('tools include response_variables', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const checkAvail = flow.tools.find((t) => t.name === 'checkAvailability');
    expect(checkAvail.response_variables).toBeDefined();
    const book = flow.tools.find((t) => t.name === 'bookAppointment');
    expect(book.response_variables).toBeDefined();
  });

  it('default_dynamic_variables include response variable placeholders', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const dvars = flow.default_dynamic_variables;
    expect(dvars).toHaveProperty('avail_success');
    expect(dvars).toHaveProperty('book_success');
  });

  // -------------------------------------------------------------------
  // else_edge IDs
  // -------------------------------------------------------------------

  it('all else_edges have an id field', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const nodesWithElse = flow.nodes.filter((n) => n.else_edge);
    expect(nodesWithElse.length).toBeGreaterThan(0);
    for (const node of nodesWithElse) {
      expect(node.else_edge.id).toBeDefined();
      expect(typeof node.else_edge.id).toBe('string');
    }
  });

  // -------------------------------------------------------------------
  // Global prompt
  // -------------------------------------------------------------------

  it('global prompt includes STAY ON TASK directive', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    expect(flow.global_prompt).toContain('STAY ON TASK');
  });

  // -------------------------------------------------------------------
  // Visual layout
  // -------------------------------------------------------------------

  it('all nodes have display_position and name', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    for (const node of flow.nodes) {
      expect(node.display_position).toBeDefined();
      expect(typeof node.display_position.x).toBe('number');
      expect(typeof node.display_position.y).toBe('number');
      expect(node.name).toBeDefined();
      expect(typeof node.name).toBe('string');
    }
  });

  it('router node is at the top (y=0)', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const router = flow.nodes.find((n) => n.id === 'router');
    expect(router.display_position.y).toBe(0);
  });

  it('has begin_tag_display_position', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    expect(flow.begin_tag_display_position).toBeDefined();
    expect(flow.begin_tag_display_position.x).toBe(0);
    expect(flow.begin_tag_display_position.y).toBe(-100);
  });

  // -------------------------------------------------------------------
  // No old booking_node
  // -------------------------------------------------------------------

  it('does not contain the old monolithic booking_node', () => {
    const flow = buildFinancialOutboundFlow(BASE_CONFIG);
    const old = flow.nodes.find((n) => n.id === 'booking_node');
    expect(old).toBeUndefined();
  });
});
