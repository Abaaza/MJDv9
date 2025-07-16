import jwt from 'jsonwebtoken';
import { env } from '../config/env';
export function generateTokens(payload) {
    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.JWT_ACCESS_EXPIRY,
        algorithm: 'HS256',
    });
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
        expiresIn: env.JWT_REFRESH_EXPIRY,
        algorithm: 'HS256',
    });
    return { accessToken, refreshToken };
}
export function verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
    });
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
    });
}
//# sourceMappingURL=jwt.js.map