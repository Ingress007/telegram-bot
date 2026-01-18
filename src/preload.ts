import fs from 'fs';
import path from 'path';

// Load environment-specific .env file based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;
const envPath = path.resolve(process.cwd(), envFile);

// Load the appropriate .env file synchronously
if (fs.existsSync(envPath)) {
  console.log(`🎯 Loading environment configuration: ${envFile}`);
  // Read and parse the .env file manually to set process.env
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  for (const line of lines) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const trimmedKey = key.trim();
        const trimmedValue = valueParts.join('=').trim();
        
        // Only set if not already set
        if (!(trimmedKey in process.env)) {
          process.env[trimmedKey] = trimmedValue;
        }
      }
    }
  }
} else {
  console.log(`⚠️ Environment file ${envFile} not found, using default .env`);
  // Load default .env file if it exists
  const defaultEnvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(defaultEnvPath)) {
    const envContent = fs.readFileSync(defaultEnvPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const trimmedKey = key.trim();
          const trimmedValue = valueParts.join('=').trim();
          
          // Only set if not already set
          if (!(trimmedKey in process.env)) {
            process.env[trimmedKey] = trimmedValue;
          }
        }
      }
    }
  }
}

export {};