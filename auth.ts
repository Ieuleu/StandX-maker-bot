import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
type Chain = "bsc" | "solana";
import dotenv from "dotenv";
dotenv.config();


const BSC_RPC_PROVIDER = process.env.BSC_RPC_PROVIDER;

if (!BSC_RPC_PROVIDER) {
  throw new Error("(login) Missing BSC_RPC_PROVIDER env var");
}

interface SignedData {
  domain: string;
  uri: string;
  statement: string;
  version: string;
  chainId: number;
  nonce: string;
  address: string;
  requestId: string;
  issuedAt: string;
  message: string;
  exp: number;
  iat: number;
}

interface LoginResponse {
  token: string;
  address: string;
  alias: string;
  chain: string;
  perpsAlpha: boolean;
}

interface RequestSignatureHeaders {
  "x-request-sign-version": string;
  "x-request-id": string;
  "x-request-timestamp": string;
  "x-request-signature": string;
}

export class StandXAuth {
  private ed25519PrivateKey: Uint8Array;
  private ed25519PublicKey: Uint8Array;
  private requestId: string;
  private baseUrl = "https://api.standx.com";
 
  constructor() {
    const privateKey = ed25519.utils.randomSecretKey();
    this.ed25519PrivateKey = privateKey;
    this.ed25519PublicKey = ed25519.getPublicKey(privateKey);
    this.requestId = base58.encode(this.ed25519PublicKey);
  }
 
  async authenticate(
    chain: Chain,
    walletAddress: string,
    signMessage: (msg: string) => Promise<string>
  ): Promise<LoginResponse> {
    const signedDataJwt = await this.prepareSignIn(chain, walletAddress);
    const payload = this.parseJwt<SignedData>(signedDataJwt);
    const signature = await signMessage(payload.message);
    return this.login(chain, signature, signedDataJwt);
  }
 
  private async prepareSignIn(chain: Chain, address: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/v1/offchain/prepare-signin?chain=${chain}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, requestId: this.requestId }),
      }
    );
    const data = await res.json();
    if (!data.success) throw new Error("Failed to prepare sign-in");
    return data.signedData;
  }
 
  private async login(
    chain: Chain,
    signature: string,
    signedData: string,
    expiresSeconds: number = 604800 // default: 7 days
  ): Promise<LoginResponse> {
    const res = await fetch(
      `${this.baseUrl}/v1/offchain/login?chain=${chain}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, signedData, expiresSeconds }),
      }
    );
    return res.json();
  }
 
  signRequest(
    payload: string,
    requestId: string,
    timestamp: number
  ): RequestSignatureHeaders {
    const version = "v1";
    const message = `${version},${requestId},${timestamp},${payload}`;
    const signature = ed25519.sign(
      Buffer.from(message, "utf-8"),
      this.ed25519PrivateKey
    );
 
    return {
      "x-request-sign-version": version,
      "x-request-id": requestId,
      "x-request-timestamp": timestamp.toString(),
      "x-request-signature": Buffer.from(signature).toString("base64"),
    };
  }
 
  private parseJwt<T>(token: string): T {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  }
}