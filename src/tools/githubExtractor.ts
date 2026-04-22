import axios from 'axios';

interface GitHubProfile {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
  company: string | null;
  blog: string;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

/**
 * Fetches GitHub profile details for a given username.
 * @param username - The GitHub username to fetch details for.
 * @returns A promise that resolves to the GitHub profile details.
 */
export async function getGitHubProfile(username: string): Promise<GitHubProfile> {
  try {
    const response = await axios.get(`https://api.github.com/users/${username}`);
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to fetch GitHub profile for ${username}: ${error.message}`);
  }
}

/**
 * Example usage of getGitHubProfile function.
 */
async function exampleUsage() {
  try {
    const profile = await getGitHubProfile('octocat');
    console.log(profile);
  } catch (error: any) {
    console.error(error);
  }
}

// Uncomment the following line to test the function
// exampleUsage();

