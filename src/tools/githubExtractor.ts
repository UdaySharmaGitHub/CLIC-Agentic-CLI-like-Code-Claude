// ─────────────────────────────────────────────────────────────────────────────
//  Tool: github — profile + streak + public repos for any GitHub user
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import chalk from 'chalk';
import {
  printToolHeader, printToolSuccess, printToolError,
  printRejected, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Interfaces ───────────────────────────────────────────────────────────────

interface GitHubProfile {
  login: string;
  name: string | null;
  company: string | null;
  blog: string;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string;
  created_at: string;
}

interface GitHubEvent {
  type: string;
  created_at: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  fork: boolean;
}

interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  lastActiveDate: string;
}

// ── Streak helper ────────────────────────────────────────────────────────────

async function fetchStreak(username: string): Promise<StreakStats> {
  const { data: events } = await axios.get<GitHubEvent[]>(
    `https://api.github.com/users/${username}/events/public`,
    { headers: { Accept: 'application/vnd.github+json' }, params: { per_page: 100 } },
  );

  const pushDays = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'PushEvent') pushDays.add(ev.created_at.slice(0, 10));
  }

  if (pushDays.size === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0, lastActiveDate: '—' };
  }

  const days = [...pushDays].sort(); // ascending

  // Longest streak in window
  let longest = 1, temp = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000;
    diff === 1 ? (temp++, longest = Math.max(longest, temp)) : (temp = 1);
  }

  // Current streak — only live if active today or yesterday
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const newest    = days[days.length - 1];
  let current = 0;
  if (newest === today || newest === yesterday) {
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const diff = (new Date(days[i + 1]).getTime() - new Date(days[i]).getTime()) / 86_400_000;
      if (diff === 1) current++; else break;
    }
  }

  return { currentStreak: current, longestStreak: longest, totalActiveDays: pushDays.size, lastActiveDate: newest };
}

// ── Tool definition ──────────────────────────────────────────────────────────

export const definition: ToolDefinition = {
  name: 'github',
  description: 'Fetch GitHub info for a user. Use action "profile" to get profile + activity streak, or "repos" to list public repositories sorted by stars.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', description: '"profile" — fetch profile & streak stats | "repos" — list public repos' },
      username: { type: 'string', description: 'GitHub username' },
      limit:    { type: 'string', description: 'For "repos": max repos to return (default 10, max 30)' },
    },
    required: ['action', 'username'],
  },
};

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function execute(
  input: { action: string; username: string; limit?: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  if (input.action === 'repos') return executeRepos(input, confirm);
  return executeProfile(input, confirm);
}

// ── Profile + streak ─────────────────────────────────────────────────────────

async function executeProfile(
  input: { username: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const { username } = input;
  printToolHeader('github › profile', `User: ${username}`);

  if (!await confirm(`Fetch GitHub profile & streak for '${username}'?`)) {
    printRejected(); printSeparator();
    return { output: 'User rejected.', isError: true };
  }

  try {
    const [profileRes, streakRes] = await Promise.allSettled([
      axios.get<GitHubProfile>(`https://api.github.com/users/${username}`, {
        headers: { Accept: 'application/vnd.github+json' },
      }),
      fetchStreak(username),
    ]);

    if (profileRes.status === 'rejected') {
      const err  = profileRes.reason;
      const code = axios.isAxiosError(err) ? err.response?.status : undefined;
      const msg  = code === 404 ? `User '${username}' not found.` : err instanceof Error ? err.message : String(err);
      printToolError(msg); printSeparator();
      return { output: `ERROR — ${msg}`, isError: true };
    }

    const p = profileRes.value.data;
    const streak: StreakStats = streakRes.status === 'fulfilled'
      ? streakRes.value
      : { currentStreak: 0, longestStreak: 0, totalActiveDays: 0, lastActiveDate: '—' };

    const profileLines = [
      `Login:        ${p.login}`,
      `Name:         ${p.name ?? '—'}`,
      `Bio:          ${p.bio ?? '—'}`,
      `Location:     ${p.location ?? '—'}`,
      `Company:      ${p.company ?? '—'}`,
      `Website:      ${p.blog || '—'}`,
      `Twitter:      ${p.twitter_username ? `@${p.twitter_username}` : '—'}`,
      `Email:        ${p.email ?? '—'}`,
      `Public repos: ${p.public_repos}`,
      `Followers:    ${p.followers}`,
      `Following:    ${p.following}`,
      `Profile URL:  ${p.html_url}`,
      `Joined:       ${new Date(p.created_at).toDateString()}`,
    ];

    const streakBar   = '🔥'.repeat(Math.min(streak.currentStreak, 10));
    const streakLines = [
      `Current streak: ${streak.currentStreak} day${streak.currentStreak !== 1 ? 's' : ''} ${streakBar}`,
      `Longest streak: ${streak.longestStreak} day${streak.longestStreak !== 1 ? 's' : ''} (last ~90 days)`,
      `Active days:    ${streak.totalActiveDays} of last ~90 days`,
      `Last active:    ${streak.lastActiveDate}`,
    ];

    console.log();
    console.log(`  ${chalk.green('  ── GitHub Profile ──────────────────────────────')}`);
    for (const line of profileLines) console.log(`    ${chalk.dim(line)}`);
    console.log();
    console.log(`  ${chalk.yellow('  ── Activity Streak ─────────────────────────────')}`);
    for (const line of streakLines) console.log(`    ${chalk.dim(line)}`);
    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess(`Profile + streak fetched for @${username}.`);
    printSeparator();

    return {
      output: [`[GitHub profile for @${username}]:`, ...profileLines, '', '[Activity Streak (~90 days):]', ...streakLines].join('\n'),
      isError: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(msg); printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}

// ── Public repos ─────────────────────────────────────────────────────────────

async function executeRepos(
  input: { username: string; limit?: string },
  confirm: ConfirmFn,
): Promise<ToolResult> {
  const { username } = input;
  const limit = Math.min(parseInt(input.limit ?? '10', 10) || 10, 30);
  printToolHeader('github › repos', `${username} — top ${limit} repos`);

  if (!await confirm(`Fetch public repos for '${username}'?`)) {
    printRejected(); printSeparator();
    return { output: 'User rejected.', isError: true };
  }

  try {
    const { data: repos } = await axios.get<GitHubRepo[]>(
      `https://api.github.com/users/${username}/repos`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        params: { sort: 'stars', direction: 'desc', per_page: limit },
      },
    );

    const own = repos.filter(r => !r.fork);
    if (own.length === 0) {
      printToolSuccess(`No public repos found for @${username}.`);
      printSeparator();
      return { output: `@${username} has no public repositories.`, isError: false };
    }

    console.log();
    console.log(`  ${chalk.green(`  ── Public Repos (@${username}) ─────────────────────`)}`);

    const lines: string[] = [];
    own.forEach((repo, i) => {
      const lang    = repo.language ?? 'unknown';
      const desc    = repo.description ? repo.description.slice(0, 72) : '—';
      const updated = new Date(repo.updated_at).toDateString();
      lines.push(`${i + 1}. ${repo.name}  [${lang}]  ⭐ ${repo.stargazers_count}  🍴 ${repo.forks_count}  (${updated})\n   ${desc}\n   ${repo.html_url}`);
      console.log(`    ${chalk.cyan(`${i + 1}. ${repo.name}`)}  ${chalk.dim(`[${lang}]  ⭐ ${repo.stargazers_count}  🍴 ${repo.forks_count}`)}`);
      console.log(`       ${chalk.dim(desc)}`);
      console.log(`       ${chalk.dim(repo.html_url)}`);
      console.log();
    });

    console.log(`  ${chalk.green('  ────────────────────────────────────────────────')}`);
    console.log();
    printToolSuccess(`Fetched ${own.length} repos for @${username}.`);
    printSeparator();

    return {
      output: `[Public repos for @${username} (${own.length} shown)]:\n\n${lines.join('\n\n')}`,
      isError: false,
    };
  } catch (err: unknown) {
    const code = axios.isAxiosError(err) ? err.response?.status : undefined;
    const msg  = code === 404 ? `User '${username}' not found.` : err instanceof Error ? err.message : String(err);
    printToolError(msg); printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
