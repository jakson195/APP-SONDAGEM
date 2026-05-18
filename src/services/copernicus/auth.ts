import axios, { type AxiosInstance } from "axios";
import {
  CDSE_OAUTH_CLIENT_ID,
  CDSE_TOKEN_URL,
  copernicusCredentials,
} from "./config";
import type { CopernicusTokenResponse } from "./types";

export type TokenResult = {
  accessToken: string;
  expiresInSec: number;
};

/**
 * OAuth2 (password grant) para OData / download no CDSE.
 * @see https://documentation.dataspace.copernicus.eu/APIs/Token.html
 */
export async function getCopernicusAccessToken(options?: {
  username?: string;
  password?: string;
  totp?: string;
}): Promise<TokenResult> {
  const creds =
    options?.username && options?.password
      ? { username: options.username, password: options.password }
      : copernicusCredentials();
  if (!creds) {
    throw new Error(
      "Credenciais Copernicus ausentes: defina COPERNICUS_USER e COPERNICUS_PASSWORD.",
    );
  }

  const body = new URLSearchParams({
    client_id: CDSE_OAUTH_CLIENT_ID,
    username: creds.username,
    password: creds.password,
    grant_type: "password",
  });
  if (options?.totp) body.set("totp", options.totp);

  const { data } = await axios.post<CopernicusTokenResponse>(
    CDSE_TOKEN_URL,
    body.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 60_000,
    },
  );

  if (!data.access_token) {
    throw new Error("Resposta OAuth sem access_token.");
  }

  return {
    accessToken: data.access_token,
    expiresInSec: data.expires_in ?? 3600,
  };
}

export function createAuthedAxios(accessToken: string): AxiosInstance {
  return axios.create({
    timeout: 120_000,
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: (s) => s >= 200 && s < 400,
  });
}
