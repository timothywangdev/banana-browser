/**
 * GitHub releases fetcher module for banana-browser
 *
 * Fetches release information from GitHub API to enable
 * automatic binary downloads.
 */

/**
 * Repository owner - configure this for your fork
 * @type {string}
 */
export const REPO_OWNER = 'vercel-labs';

/**
 * Repository name - configure this for your fork
 * @type {string}
 */
export const REPO_NAME = 'agent-browser';

/**
 * Default GitHub repository for agent-browser
 * Constructed from REPO_OWNER and REPO_NAME for easy configuration
 */
const DEFAULT_REPO = `${REPO_OWNER}/${REPO_NAME}`;

/**
 * Asset naming convention for platform binaries
 * These names must match what the release workflow produces
 */
export const ASSET_NAMES = {
  'linux-x64': 'agent-browser-linux-x64',
  'darwin-arm64': 'agent-browser-darwin-arm64',
  'darwin-x64': 'agent-browser-darwin-x64',
};

/**
 * GitHub API base URL
 */
const GITHUB_API = 'https://api.github.com';

/**
 * Fetch the latest release from a GitHub repository
 *
 * @param {string} [repo=DEFAULT_REPO] - Repository in "owner/repo" format
 * @returns {Promise<{
 *   tagName: string,
 *   version: string,
 *   name: string,
 *   publishedAt: string,
 *   assets: Array<{ name: string, downloadUrl: string, size: number }>
 * }>}
 * @throws {Error} If the API request fails or no releases exist
 *
 * @example
 * const release = await getLatestRelease();
 * console.log(`Latest version: ${release.version}`);
 */
export async function getLatestRelease(repo = DEFAULT_REPO) {
  const url = `${GITHUB_API}/repos/${repo}/releases/latest`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'banana-browser-npm',
      },
    });

    if (response.status === 404) {
      throw new Error(`No releases found for repository: ${repo}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${text}`);
    }

    const data = await response.json();

    return {
      tagName: data.tag_name,
      version: data.tag_name.replace(/^v/, ''), // Remove leading 'v' if present
      name: data.name || data.tag_name,
      publishedAt: data.published_at,
      assets: (data.assets || []).map(asset => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
      })),
    };
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error(
        `Failed to fetch release info: Network error\n` +
        `Please check your internet connection and try again.`
      );
    }
    throw error;
  }
}

/**
 * Get a specific release by tag
 *
 * @param {string} tag - Release tag (e.g., "v0.20.5")
 * @param {string} [repo=DEFAULT_REPO] - Repository in "owner/repo" format
 * @returns {Promise<{
 *   tagName: string,
 *   version: string,
 *   name: string,
 *   publishedAt: string,
 *   assets: Array<{ name: string, downloadUrl: string, size: number }>
 * }>}
 */
export async function getReleaseByTag(tag, repo = DEFAULT_REPO) {
  const url = `${GITHUB_API}/repos/${repo}/releases/tags/${tag}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'banana-browser-npm',
    },
  });

  if (response.status === 404) {
    throw new Error(`Release not found: ${tag}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${text}`);
  }

  const data = await response.json();

  return {
    tagName: data.tag_name,
    version: data.tag_name.replace(/^v/, ''),
    name: data.name || data.tag_name,
    publishedAt: data.published_at,
    assets: (data.assets || []).map(asset => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size,
    })),
  };
}

/**
 * Find the download URL for a specific asset in a release
 *
 * @param {{ assets: Array<{ name: string, downloadUrl: string }> }} release - Release object from getLatestRelease
 * @param {string} assetName - Name of the asset to find (e.g., "agent-browser-darwin-arm64")
 * @returns {string|null} Download URL or null if not found
 *
 * @example
 * const release = await getLatestRelease();
 * const url = getAssetUrl(release, 'agent-browser-darwin-arm64');
 * if (url) {
 *   await downloadBinary(url, '/path/to/binary');
 * }
 */
export function getAssetUrl(release, assetName) {
  const asset = release.assets.find(a => a.name === assetName);
  return asset ? asset.downloadUrl : null;
}

/**
 * Get all asset names from a release
 *
 * @param {{ assets: Array<{ name: string }> }} release - Release object
 * @returns {string[]} Array of asset names
 */
export function getAssetNames(release) {
  return release.assets.map(a => a.name);
}

/**
 * Build a direct download URL for a GitHub release asset
 *
 * This URL format works without API rate limits.
 *
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} tag - Release tag (e.g., "v0.20.5")
 * @param {string} assetName - Asset filename
 * @returns {string}
 */
export function buildDirectDownloadUrl(repo, tag, assetName) {
  return `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
}

/**
 * Get the expected asset name for a given platform
 *
 * @param {string} platformKey - Platform key (e.g., "linux-x64", "darwin-arm64", "darwin-x64")
 * @returns {string|null} Asset name or null if platform not supported
 *
 * @example
 * const assetName = getAssetNameForPlatform('darwin-arm64');
 * // Returns: 'agent-browser-darwin-arm64'
 */
export function getAssetNameForPlatform(platformKey) {
  return ASSET_NAMES[platformKey] || null;
}

/**
 * Get download URL for a specific platform from the latest release
 *
 * @param {string} platformKey - Platform key (e.g., "linux-x64", "darwin-arm64", "darwin-x64")
 * @param {string} [repo=DEFAULT_REPO] - Repository in "owner/repo" format
 * @returns {Promise<{ url: string, version: string, assetName: string } | null>}
 *
 * @example
 * const download = await getDownloadForPlatform('darwin-arm64');
 * if (download) {
 *   console.log(`Downloading ${download.assetName} v${download.version}`);
 *   // download from download.url
 * }
 */
export async function getDownloadForPlatform(platformKey, repo = DEFAULT_REPO) {
  const assetName = getAssetNameForPlatform(platformKey);
  if (!assetName) {
    return null;
  }

  const release = await getLatestRelease(repo);
  const url = getAssetUrl(release, assetName);

  if (!url) {
    return null;
  }

  return {
    url,
    version: release.version,
    assetName,
  };
}
