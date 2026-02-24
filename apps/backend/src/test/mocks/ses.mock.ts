export const createMockSESClient = () => ({
  send: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' }),
});

export const createMockEmailService = () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
});
