import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { AuthError } from '../utils/errors';

const prisma = new PrismaClient();

export interface TokenPayload {
  userId: string;
  role: string;
  locationId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  locationId: string | null;
}

/**
 * Hash a plain-text password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Login with email + password.
 * Finds the user, verifies the password, and returns user data + JWT.
 */
export async function login(
  email: string,
  password: string
): Promise<{ user: AuthenticatedUser; token: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    throw new AuthError('Invalid email or password');
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError('Invalid email or password');
  }

  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    locationId: user.locationId,
  };

  const token = generateToken(payload);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      locationId: user.locationId,
    },
    token,
  };
}

/**
 * Login with PIN + location.
 * Finds the user by PIN and location, returns user data + JWT.
 * No password check — PIN alone is sufficient for quick budtender login.
 */
export async function loginWithPin(
  pin: string,
  locationId: string
): Promise<{ user: AuthenticatedUser; token: string }> {
  const user = await prisma.user.findFirst({
    where: {
      pin,
      locationId,
      isActive: true,
    },
  });

  if (!user) {
    throw new AuthError('Invalid PIN or location');
  }

  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    locationId: user.locationId,
  };

  const token = generateToken(payload);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      locationId: user.locationId,
    },
    token,
  };
}

/**
 * Get current user from token payload (DB lookup).
 */
export async function getUserFromToken(payload: TokenPayload): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user || !user.isActive) {
    throw new AuthError('User not found or inactive');
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    locationId: user.locationId,
  };
}

/**
 * Verify a JWT token and return the decoded payload.
 * Throws AuthError if token is invalid or expired.
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return decoded;
  } catch (err) {
    throw new AuthError('Invalid or expired token');
  }
}

/**
 * Generate a JWT token from a payload.
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}
