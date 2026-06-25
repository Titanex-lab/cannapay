import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';

/**
 * Returns Express middleware that restricts access to specified roles.
 *
 * Usage:
 *   router.get('/admin-only', requireRole('admin'), handler);
 *   router.post('/manage', requireRole('store_manager', 'admin'), handler);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
}
