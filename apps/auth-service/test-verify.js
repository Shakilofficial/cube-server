const fs = require('fs');
const path = require('path');
const { JwtService } = require('@nestjs/jwt');

// 1. Load the env file and parse manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      envVars[key] = val;
    }
  }
}

const rawSecret = envVars['JWT_ACCESS_SECRET'];
// dotenv behavior: strips outer quotes
const cleanSecret = rawSecret.startsWith('"') && rawSecret.endsWith('"') 
  ? rawSecret.slice(1, -1) 
  : rawSecret;

console.log('Raw Secret in .env:', rawSecret);
console.log('Clean Secret (dotenv behavior):', cleanSecret);

const jwtService = new JwtService();

async function run() {
  const payload = { sub: 'test-user-id', email: 'test@example.com', status: 'ACTIVE' };

  // Case A: Sign with clean, verify with clean
  try {
    const token = await jwtService.signAsync(payload, { secret: cleanSecret, expiresIn: '15m' });
    const verified = await jwtService.verifyAsync(token, { secret: cleanSecret });
    console.log('Case A (clean/clean) Success:', !!verified);
  } catch (err) {
    console.log('Case A Fail:', err.message);
  }

  // Case B: Sign with clean, verify with raw (with quotes)
  try {
    const token = await jwtService.signAsync(payload, { secret: cleanSecret, expiresIn: '15m' });
    const verified = await jwtService.verifyAsync(token, { secret: rawSecret });
    console.log('Case B (clean/raw) Success:', !!verified);
  } catch (err) {
    console.log('Case B Fail:', err.message);
  }

  // Case C: Sign with raw, verify with clean
  try {
    const token = await jwtService.signAsync(payload, { secret: rawSecret, expiresIn: '15m' });
    const verified = await jwtService.verifyAsync(token, { secret: cleanSecret });
    console.log('Case C (raw/clean) Success:', !!verified);
  } catch (err) {
    console.log('Case C Fail:', err.message);
  }

  // Case D: Sign with raw, verify with raw
  try {
    const token = await jwtService.signAsync(payload, { secret: rawSecret, expiresIn: '15m' });
    const verified = await jwtService.verifyAsync(token, { secret: rawSecret });
    console.log('Case D (raw/raw) Success:', !!verified);
  } catch (err) {
    console.log('Case D Fail:', err.message);
  }
}

run().catch(console.error);
