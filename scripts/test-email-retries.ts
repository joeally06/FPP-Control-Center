import assert from 'assert';
import net from 'net';
import { sendMailWithRetries } from '../lib/email-service';

function print(msg: string) {
  console.log('[test-email-retries] ' + msg);
}

const config = { host: 'mock', port: 587, secure: false, auth: { user: 'a', pass: 'b' } };
const mailOptions = { from: 'noreply@example.com', to: 'user@example.com', subject: 'Test', text: 'Hello' };
const fast = { initialDelayMs: 1, factor: 1 };

// A transport whose sendMail fails with `error` the first `failures` times, then succeeds; counts calls
function flakyTransport(failures: number, error: () => Error) {
  const state = { calls: 0 };
  const createTransport = () => ({
    verify: async () => true,
    sendMail: async () => {
      state.calls += 1;
      if (state.calls <= failures) throw error();
      return { messageId: `mock-${state.calls}` };
    },
  });
  return { state, createTransport };
}

const withCode = (code: string, message = 'mock error', extra: Record<string, unknown> = {}) => () =>
  Object.assign(new Error(message), { code }, extra);

async function main() {
  print('Test 1: a connection error that clears up is retried until it works');
  {
    const { state, createTransport } = flakyTransport(2, withCode('ECONNREFUSED', 'Mock connection error'));
    const info = await sendMailWithRetries(config, mailOptions, { attempts: 4, ...fast, createTransport });
    assert.strictEqual(info.messageId, 'mock-3');
    assert.strictEqual(state.calls, 3);
  }

  print('Test 2: the codes nodemailer really reports for a refused or dropped connection are retried');
  for (const code of ['ESOCKET', 'ECONNECTION', 'EDNS', 'ETIMEDOUT']) {
    const { state, createTransport } = flakyTransport(1, withCode(code, `connect ${code}`));
    const info = await sendMailWithRetries(config, mailOptions, { attempts: 3, ...fast, createTransport });
    assert.strictEqual(info.messageId, 'mock-2', code);
    assert.strictEqual(state.calls, 2, `${code} should be tried again`);
  }

  print('Test 3: a temporary 4xx answer from the server is retried');
  {
    const { state, createTransport } = flakyTransport(1, withCode('EMESSAGE', '451 try later', { responseCode: 451 }));
    await sendMailWithRetries(config, mailOptions, { attempts: 3, ...fast, createTransport });
    assert.strictEqual(state.calls, 2);
  }

  print('Test 4: errors that waiting will not fix are tried once');
  for (const [name, make] of [
    ['EAUTH', withCode('EAUTH', 'Invalid login', { responseCode: 535 })],
    ['EENVELOPE', withCode('EENVELOPE', 'No recipients defined')],
    ['ETLS', withCode('ETLS', 'Error initiating TLS')],
    ['5xx', withCode('EMESSAGE', '550 mailbox unavailable', { responseCode: 550 })],
    ['no code', () => new Error('something else')],
  ] as const) {
    const { state, createTransport } = flakyTransport(99, make);
    await assert.rejects(sendMailWithRetries(config, mailOptions, { attempts: 3, ...fast, createTransport }), (err: unknown) => err instanceof Error, name);
    assert.strictEqual(state.calls, 1, `${name} must not be retried`);
  }

  print('Test 5: it gives up after the last attempt and throws the last error');
  {
    const { state, createTransport } = flakyTransport(99, withCode('ESOCKET', 'connect ECONNREFUSED 127.0.0.1:587'));
    await assert.rejects(
      sendMailWithRetries(config, mailOptions, { attempts: 3, ...fast, createTransport }),
      (err: any) => err.code === 'ESOCKET'
    );
    assert.strictEqual(state.calls, 3);
  }

  print('Test 6: the real nodemailer, against a port where nothing is listening, is retried (no mail is sent)');
  {
    const port = await new Promise<number>((resolve) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer');
    let verifyCalls = 0;
    const createTransport = () => {
      const transporter = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, connectionTimeout: 2000 });
      return {
        verify: () => { verifyCalls += 1; return transporter.verify(); },
        sendMail: (options: unknown) => transporter.sendMail(options),
      };
    };
    await assert.rejects(
      sendMailWithRetries(config, mailOptions, { attempts: 3, ...fast, createTransport }),
      (err: any) => {
        // nodemailer labels a refused connection ESOCKET, not ECONNREFUSED - the reason this test exists
        assert.ok(['ESOCKET', 'ECONNECTION'].includes(err.code), `unexpected code ${err.code}`);
        return true;
      }
    );
    assert.strictEqual(verifyCalls, 3, 'a refused connection should be tried 3 times');
  }

  print('All tests passed');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[test-email-retries] failed:', err);
    process.exit(1);
  }
);
