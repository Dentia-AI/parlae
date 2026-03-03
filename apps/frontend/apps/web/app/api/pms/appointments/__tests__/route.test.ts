import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getAppointments: jest.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'apt-1', date: '2026-03-10', patientId: 'p1' }],
    }),
    bookAppointment: jest.fn().mockResolvedValue({
      success: true,
      data: { id: 'apt-new', date: '2026-03-15' },
    }),
  }),
  logPmsAccess: jest.fn().mockResolvedValue(undefined),
  verifyVapiSignature: jest.fn().mockReturnValue(true),
  getAccountIdFromVapiContext: jest.fn().mockReturnValue('acc-1'),
  redactPhi: jest.fn((d) => d),
}));

jest.mock('../../_lib/google-calendar-utils', () => ({
  bookGoogleCalendarAppointment: jest.fn().mockResolvedValue(undefined),
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  extractPatientFromVapiData: jest.fn().mockReturnValue({ firstName: 'Jane', lastName: 'Doe' }),
  extractAppointmentFromVapiData: jest.fn().mockReturnValue({
    date: '2026-03-15',
    time: '10:00',
    type: 'Cleaning',
    providerId: 'dr-1',
    duration: 30,
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pms-1' }),
    },
    account: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'acc-1',
        googleCalendarConnected: false,
      }),
    },
  },
}));

function vapiRequest(url: string, method: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { 'x-vapi-secret': 'valid-sig' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/pms/appointments', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists appointments', async () => {
    const req = vapiRequest('http://localhost/api/pms/appointments', 'POST', {
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/appointments', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/pms/appointments', () => {
  afterEach(() => jest.clearAllMocks());

  it('books an appointment', async () => {
    const req = vapiRequest('http://localhost/api/pms/appointments', 'POST', {
      data: {
        patientId: 'p1',
        appointmentType: 'Cleaning',
        startTime: '2026-03-15T10:00:00Z',
        duration: 30,
        providerId: 'dr-1',
      },
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
