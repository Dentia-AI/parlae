import { StructuredLogger } from './structured-logger';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new StructuredLogger('TestContext');
    // Spy on the parent Logger methods
    logSpy = jest
      .spyOn(Object.getPrototypeOf(StructuredLogger.prototype), 'log')
      .mockImplementation();
    warnSpy = jest
      .spyOn(Object.getPrototypeOf(StructuredLogger.prototype), 'warn')
      .mockImplementation();
    errorSpy = jest
      .spyOn(Object.getPrototypeOf(StructuredLogger.prototype), 'error')
      .mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('log', () => {
    it('should pass strings through', () => {
      logger.log('hello');
      expect(logSpy).toHaveBeenCalledWith('hello');
    });

    it('should stringify objects', () => {
      logger.log({ key: 'value' });
      expect(logSpy).toHaveBeenCalledWith('{"key":"value"}');
    });

    it('should handle null', () => {
      logger.log(null);
      expect(logSpy).toHaveBeenCalledWith('null');
    });

    it('should handle undefined', () => {
      logger.log(undefined);
      expect(logSpy).toHaveBeenCalledWith('undefined');
    });
  });

  describe('warn', () => {
    it('should stringify objects for warnings', () => {
      logger.warn({ warning: true });
      expect(warnSpy).toHaveBeenCalledWith('{"warning":true}');
    });

    it('should pass strings through', () => {
      logger.warn('caution');
      expect(warnSpy).toHaveBeenCalledWith('caution');
    });
  });

  describe('error', () => {
    it('should extract Error message and stack', () => {
      const err = new Error('boom');
      logger.error(err);
      expect(errorSpy).toHaveBeenCalledWith('boom', err.stack);
    });

    it('should stringify non-Error objects', () => {
      logger.error({ code: 500 });
      expect(errorSpy).toHaveBeenCalledWith('{"code":500}');
    });

    it('should pass strings through', () => {
      logger.error('fatal');
      expect(errorSpy).toHaveBeenCalledWith('fatal');
    });
  });
});
