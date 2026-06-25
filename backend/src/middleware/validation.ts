import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }));
}

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            statusCode: 400,
            details: formatZodErrors(error),
          },
        });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            message: 'Invalid query parameters',
            statusCode: 400,
            details: formatZodErrors(error),
          },
        });
        return;
      }
      next(error);
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            message: 'Invalid route parameters',
            statusCode: 400,
            details: formatZodErrors(error),
          },
        });
        return;
      }
      next(error);
    }
  };
}
