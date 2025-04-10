import axios from 'axios';
import * as cheerio from 'cheerio';
import config from './config';
import { URL } from 'url'; // Use Node.js URL class for robust URL handling

const MONITOR_URL = config.monitorUrl; // Use the renamed config property

// Regular expressions for matching directory patterns
// Regex patterns adjusted for leading slash and capture group focus
const YEAR_MONTH_REGEX = /^\/(\d{6})\/$/; // Matches /YYYYMM/, captures YYYYMM
// Updated regex to match full path structure and capture relevant part
const DAY_REGEX = /\/(\d{8})\/$/;        // Matches /YYYYMM/YYYYMMDD/, captures YYYYMMDD
const RUN_REGEX = /\/(t\d{2}z)\/$/;      // Matches /YYYYMM/YYYYMMDD/tXXz/, captures tXXz
// Regex for tornado images (ensure it matches the specific patterns requested)
const TORNADO_IMG_REGEX = /_(sig_)?tornado_.*\.png$/i; // Matches _tornado_*.png and _sig_tornado_*.png

interface RunInfo {
    runId: string; // e.g., "20250408_t00z"
    runUrl: string; // Full URL to the specific run directory
}

/**
 * Fetches HTML content from a given URL.
 * @param url The URL to fetch.
 * @returns The HTML content as a string.
 * @throws Error if fetching fails.
 */
async function fetchHtml(url: string): Promise<string> {
    try {
        console.log(`Fetching HTML from: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'NadocastMonitorBot/1.0 (+https://github.com/your-repo)' // Be a good citizen
            },
            timeout: 15000 // 15 second timeout
        });
        if (response.status !== 200) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        console.log(`Successfully fetched HTML from: ${url}`);
        return response.data;
    } catch (error: any) {
        console.error(`Error fetching URL ${url}:`, error.message);
        throw new Error(`Failed to fetch HTML from ${url}: ${error.message}`);
    }
}

/**
 * Finds the latest directory link matching a regex pattern on an HTML page.
 * @param pageUrl The URL of the HTML page to parse.
 * @param patternRegex The regex to match directory names (e.g., /^\d{6}\/$/).
 * @returns The full URL of the latest matching directory, or null if none found.
 * @throws Error if fetching or parsing fails.
 */
async function findLatestDirectoryUrl(pageUrl: string, patternRegex: RegExp): Promise<string | null> {
    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);
    let latestDirValue: string | null = null; // Store the comparable value (e.g., "202504")
    let latestDirUrl: string | null = null;

    // Use more specific selector for directory links
    $('a.directory').each((_index, element) => {
        const href = $(element).attr('href');
        if (href) {
            const match = href.match(patternRegex);
            // Check if match exists and has the captured group (match[1])
            if (match && match[1]) {
                const dirValue = match[1]; // Use the captured group (e.g., "202504", "08", "t00z")
                // Compare the captured values
                if (latestDirValue === null || dirValue > latestDirValue) {
                    latestDirValue = dirValue;
                    // Construct absolute URL
                    try {
                        // Ensure href is treated as relative to the pageUrl
                        latestDirUrl = new URL(href, pageUrl).toString();
                    } catch (urlError) {
                        console.error(`Error constructing URL from base ${pageUrl} and href ${href}:`, urlError);
                        // Skip this invalid link
                    }
                }
            }
        }
    });

    if (latestDirUrl) {
        console.log(`Found latest directory matching ${patternRegex} at ${pageUrl}: ${latestDirUrl}`);
    } else {
        console.warn(`No directory matching ${patternRegex} found at ${pageUrl}`);
    }
    return latestDirUrl;
}

/**
 * Finds the URLs of tornado probability images within a specific run directory.
 * @param runDirUrl The URL of the forecast run directory.
 * @returns An array of full URLs to the tornado PNG images.
 * @throws Error if fetching or parsing fails.
 */
export async function findTornadoImageUrls(runDirUrl: string): Promise<string[]> {
    const html = await fetchHtml(runDirUrl);
    const $ = cheerio.load(html);
    const imageUrls: string[] = [];

    // Use more specific selector for file links if applicable, or just check href
    $('a').each((_index, element) => { // Keep 'a' if file class isn't guaranteed, rely on regex
        const href = $(element).attr('href');
        // Check href exists and matches the specific tornado image pattern
        // Check href exists, matches the general tornado pattern, AND does NOT contain excluded terms
        if (href && TORNADO_IMG_REGEX.test(href) && !href.includes('abs_calib') && !href.includes('life_risk')) {
            try {
                const fullUrl = new URL(href, runDirUrl).toString();
                imageUrls.push(fullUrl);
                console.log(`Found relevant tornado image: ${fullUrl}`); // Log specifically relevant ones
            } catch (urlError) {
                console.error(`Error constructing image URL from base ${runDirUrl} and href ${href}:`, urlError);
            }
        }
    });

    if (imageUrls.length === 0) {
        console.warn(`No relevant tornado images (excluding abs_calib, life_risk) found in directory: ${runDirUrl}`);
    }
    return imageUrls;
}

/**
 * Scrapes the NADOCast site to find the latest forecast run directory and its ID.
 * @returns An object containing the latest run ID and its URL, or null if not found.
 */
export async function findLatestRunInfo(): Promise<RunInfo | null> {
    try {
        console.log(`Starting scrape process from base URL: ${MONITOR_URL}`); // Use MONITOR_URL

        const latestYearMonthUrl = await findLatestDirectoryUrl(MONITOR_URL, YEAR_MONTH_REGEX); // Use MONITOR_URL
        if (!latestYearMonthUrl) return null;
        // Extract parts from the URLs more robustly
        const yearMonthMatch = latestYearMonthUrl.match(/\/(\d{6})\/$/);
        const yearMonth = yearMonthMatch ? yearMonthMatch[1] : null;
        if (!yearMonth) {
            console.error("Could not extract yearMonth from URL:", latestYearMonthUrl);
            return null;
        }

        const latestDayUrl = await findLatestDirectoryUrl(latestYearMonthUrl, DAY_REGEX);
        if (!latestDayUrl) return null;
        // Use the updated DAY_REGEX to extract YYYYMMDD
        const dayMatch = latestDayUrl.match(DAY_REGEX);
        const dayYYYYMMDD = dayMatch ? dayMatch[1] : null; // This is now YYYYMMDD
         if (!dayYYYYMMDD) {
            console.error("Could not extract YYYYMMDD from URL:", latestDayUrl);
            return null;
        }
        // We use dayYYYYMMDD directly in runId, so no need to extract 'day' separately.

        const latestRunUrl = await findLatestDirectoryUrl(latestDayUrl, RUN_REGEX);
        if (!latestRunUrl) return null;
        // Use the updated RUN_REGEX to extract tXXz
        const runTimeMatch = latestRunUrl.match(RUN_REGEX);
        const runTime = runTimeMatch ? runTimeMatch[1] : null;
         if (!runTime) {
            console.error("Could not extract run time from URL:", latestRunUrl);
            return null;
        }


        // Construct runId using YYYYMMDD and tXXz
        const runId = `${dayYYYYMMDD}_${runTime}`; // Use YYYYMMDD directly
        console.log(`Latest run identified: ID=${runId}, URL=${latestRunUrl}`);

        return {
            runId: runId,
            runUrl: latestRunUrl,
        };
    } catch (error) {
        console.error('Error during scraping process:', error);
        return null; // Return null on any scraping error to prevent partial results
    }
}