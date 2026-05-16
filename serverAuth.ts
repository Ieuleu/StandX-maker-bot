import { StandXAuth } from './auth';
import fs from 'fs';

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

export class ServerAuth {
  private auth: StandXAuth;
  private tokenData: AuthToken;

  constructor(authTokenPath: string = './authToken.json') {
    if (!fs.existsSync(authTokenPath)) {
      throw new Error(
        `Auth token file not found at ${authTokenPath}\n` +
        `Please run 'tsx generate-token.ts' on your local machine and upload the file.`
      );
    }

    this.tokenData = JSON.parse(fs.readFileSync(authTokenPath, 'utf-8'));
    
    // Vérifier si le token a expiré
    const expiresAt = new Date(this.tokenData.expiresAt);
    const now = new Date();
    
    if (now > expiresAt) {
      throw new Error(
        `Token expired at ${expiresAt.toISOString()}\n` +
        `Please generate a new token with 'npm run generate-token'`
      );
    }

    // Warn if the token expire in less than 24 hours
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 24) {
      console.warn(`(ServerAuth) Token expires in ${hoursUntilExpiry.toFixed(1)} hours`);
      console.warn(`(ServerAuth) Please generate a new token soon!`);
    }

    this.auth = this.recreateAuth();
    
    console.log('(ServerAuth) auth address:', this.tokenData.address);
    console.log('(ServerAuth) auth expiration:', expiresAt.toISOString());
  }

  private recreateAuth(): StandXAuth {
    const auth = new StandXAuth();
    
    // Recover ed25519 keys from the token 
    (auth as any).ed25519PrivateKey = Buffer.from(
      this.tokenData.ed25519PrivateKey,
      'base64'
    );
    (auth as any).ed25519PublicKey = Buffer.from(
      this.tokenData.ed25519PublicKey,
      'base64'
    );
    (auth as any).requestId = this.tokenData.requestId;

    return auth;
  }

  getAuth(): StandXAuth {
    return this.auth;
  }

  getToken(): string {
    return this.tokenData.token;
  }

  getAccountInfo() {
    return {
      address: this.tokenData.address,
      alias: this.tokenData.alias,
      chain: this.tokenData.chain,
      expiresAt: this.tokenData.expiresAt,
    };
  }
}