import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';

function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const key = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:${salt}:${key}`;
}

async function readPassword(prompt) {
  if (!stdin.isTTY) {
    let input = '';
    for await (const chunk of stdin) input += chunk;
    return input.trimEnd();
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return await new Promise((resolve, reject) => {
    let value = '';

    function done(error) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }

    function onData(char) {
      if (char === '\u0003') done(new Error('Cancelled.'));
      else if (char === '\r' || char === '\n') done();
      else if (char === '\u007f') value = value.slice(0, -1);
      else value += char;
    }

    stdin.on('data', onData);
  });
}

const password = await readPassword('Superadmin password to hash: ');
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

console.log(`PORTAL_SUPERADMIN_PASSWORD_HASH=${hashPassword(password)}`);
