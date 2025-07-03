import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserPayload, TokenPair } from '../types/auth.js';

export function generateTokens(payload: UserPayload): TokenPair {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  } as jwt.SignOptions);

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): UserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as UserPayload;
}

export function verifyRefreshToken(token: string): UserPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as UserPayload;
}