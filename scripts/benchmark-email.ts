import net from 'net';
import { performance } from 'perf_hooks';

// Set env vars BEFORE importing the service
process.env.EMAIL_SERVER_HOST = 'localhost';
process.env.EMAIL_SERVER_PORT = '1025';
process.env.EMAIL_SERVER_USER = 'test';
process.env.EMAIL_SERVER_PASSWORD = 'test';
(process.env as any).NODE_ENV = 'test';

async function startRobustMockSMTPServer(port: number): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let inDataMode = false;
      let buffer = '';

      socket.write('220 localhost Mock SMTP Server\r\n');

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let index;
        while ((index = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.substring(0, index);
          buffer = buffer.substring(index + 2);

          if (inDataMode) {
            if (line === '.') {
              inDataMode = false;
              socket.write('250 2.0.0 Ok: queued\r\n');
            }
          } else {
            const cmd = line.toUpperCase();
            if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
              socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
            } else if (cmd.startsWith('AUTH')) {
              socket.write('235 2.7.0 Authentication successful\r\n');
            } else if (cmd.startsWith('MAIL FROM')) {
              socket.write('250 2.1.0 Ok\r\n');
            } else if (cmd.startsWith('RCPT TO')) {
              socket.write('250 2.1.5 Ok\r\n');
            } else if (cmd.startsWith('DATA')) {
              inDataMode = true;
              socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
            } else if (cmd.startsWith('QUIT')) {
              socket.write('221 2.0.0 Bye\r\n');
              socket.end();
            } else {
              // Ignore unknown or handle RSET/NOOP
            }
          }
        }
      });

      socket.on('error', (err) => {
        // Ignore connection errors
      });
    });

    server.listen(port, () => {
      console.log(`Mock SMTP Server listening on port ${port}`);
      resolve(server);
    });
  });
}

async function main() {
  const PORT = 1025;
  const server = await startRobustMockSMTPServer(PORT);

  try {
    const { emailService } = await import('@/services/email.service');

    const ITERATIONS = 50;
    console.log(`Sending ${ITERATIONS} emails...`);

    const start = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      await emailService.sendMail({
        to: 'test@example.com',
        subject: `Test ${i}`,
        html: `<p>Test email ${i}</p>`,
      });
    }

    const end = performance.now();
    const duration = end - start;
    console.log(`Total time: ${duration.toFixed(2)}ms`);
    console.log(`Average time per email: ${(duration / ITERATIONS).toFixed(2)}ms`);
  } catch (error) {
    console.error('Error during benchmark:', error);
  } finally {
    server.close();
    process.exit(0);
  }
}

main();
