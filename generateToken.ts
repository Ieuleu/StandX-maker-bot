import { StandXAuth } from './auth';
import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface AuthToken {
  token: string;
  address: string;
  alias: string;
  chain: string;
  requestId: string;
  ed25519PrivateKey: string;
  ed25519PublicKey: string;
  createdAt: string;
  expiresAt: string;
}

async function generateToken() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const BSC_RPC_PROVIDER = process.env.BSC_RPC_PROVIDER;

  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env");

  const provider = new ethers.JsonRpcProvider(BSC_RPC_PROVIDER);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Wallet address:', wallet.address);
  console.log('Authenticating...');

  const auth = new StandXAuth();
  
  // Faire le login COMPLET ici (avec la signature)
  const loginResponse = await auth.authenticate(
    "bsc",
    wallet.address,
    async (message) => {
      console.log('Signing message...');
      return wallet.signMessage(message);
    }
  );

  console.log('Login successful!');
  console.log('Alias:', loginResponse.alias);
  console.log('Chain:', loginResponse.chain);

  // compute expire date
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const authToken: AuthToken = {
    token: loginResponse.token,
    address: loginResponse.address,
    alias: loginResponse.alias,
    chain: loginResponse.chain,
    requestId: (auth as any).requestId,
    ed25519PrivateKey: Buffer.from((auth as any).ed25519PrivateKey).toString('base64'),
    ed25519PublicKey: Buffer.from((auth as any).ed25519PublicKey).toString('base64'),
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  fs.writeFileSync('authToken.json', JSON.stringify(authToken, null, 2));
  fs.chmodSync('authToken.json', 0o600);

  console.log('');
  console.log('Authentication token saved to auth-token.json');
  console.log('Token expires at:', expiresAt.toISOString());
  console.log('Upload this file to your server');
}

generateToken().catch(console.error);