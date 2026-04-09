import { z } from 'zod';

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export const subscribeSchema = z.object({
  email: z.string().email('Invalid email format'),
  repo: z
    .string()
    .regex(REPO_REGEX, 'Invalid repo format. Expected: owner/repo'),
});

export const emailQuerySchema = z.object({
  email: z.string().email('Invalid email'),
});

export const tokenParamSchema = z.object({
  token: z.string().uuid('Invalid token format'),
});

export function parseRepo(repo: string): { owner: string; repo: string } {
  const [owner, repoName] = repo.split('/');
  return { owner, repo: repoName };
}
