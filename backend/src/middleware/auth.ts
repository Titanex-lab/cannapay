import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/auth.service';
import { AuthError } from '../utils/errors';

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        locationId: string | null;
      };
    }
  }
}

/**
 * Express middleware that authenticates requests via Bearer token.
 * Verifies JWT, attaches decoded user info to `req.user`, then calls next().
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('No token provided');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new AuthError('No token provided');
  }

  const payload: TokenPayload = verifyToken(token);

  req.user = {
    id: payload.userId,
    role: payload.role,
    locationId: payload.locationId,
  };

  next();
}
