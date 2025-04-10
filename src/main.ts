import config from './config';
import { readLastProcessedRunId, writeLastProcessedRunId } from './state_manager';
import { findLatestRunInfo, findTornadoImageUrls } from './scraper';
import { fetchImages } from './image_fetcher';
import { notifyBluesky } from './bluesky_notifier';

// --- Logging Setup ---
// Basic console logging, could be replaced with a more robust logger like Winston or Pino
enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

const currentLogLevel: LogLevel = (LogLevel[config.logLevel.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO);

function log(level: LogLevel, message: string, ...args: any[]) {
    if (level >= currentLogLevel) {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level];
        console[level === LogLevel.ERROR ? 'error' : level === LogLevel.WARN ? 'warn' : 'log'](
            `[${timestamp}] [${levelStr}] ${message}`, ...args
        );
    }
}
// --- End Logging Setup ---


let isProcessing = false; // Simple lock to prevent concurrent runs

/**
 * The core function that checks for new NADOCast runs and processes them.
 */
async function checkNadocast(): Promise<void> {
    if (isProcessing) {
        log(LogLevel.WARN, 'Check already in progress. Skipping this interval.');
        return;
    }
    isProcessing = true;
    log(LogLevel.INFO, 'Starting NADOCast check...');

    try {
        // 1. Find the latest run information
        const latestRun = await findLatestRunInfo();
        if (!latestRun) {
            log(LogLevel.WARN, 'Could not determine the latest NADOCast run.');
            isProcessing = false;
            return;
        }
        log(LogLevel.INFO, `Latest run found: ID=${latestRun.runId}, URL=${latestRun.runUrl}`);

        // 2. Get the last processed run ID
        const lastProcessedId = await readLastProcessedRunId();
        log(LogLevel.INFO, `Last processed run ID from state: ${lastProcessedId || 'None'}`);

        // 3. Compare and decide if processing is needed
        if (latestRun.runId === lastProcessedId) {
            log(LogLevel.INFO, 'Latest run has already been processed. No action needed.');
            isProcessing = false;
            return;
        }

        log(LogLevel.INFO, `New run detected: ${latestRun.runId}. Processing...`);

        // 4. Find tornado image URLs for the new run
        const imageUrls = await findTornadoImageUrls(latestRun.runUrl);
        if (imageUrls.length === 0) {
            log(LogLevel.WARN, `No tornado images found for run ${latestRun.runId}. Updating state anyway.`);
            // Update state even if no images, to avoid reprocessing this run ID
            await writeLastProcessedRunId(latestRun.runId);
            isProcessing = false;
            return;
        }
        log(LogLevel.INFO, `Found ${imageUrls.length} tornado images for run ${latestRun.runId}.`);

        // 5. Process each relevant image individually
        // Loop through each relevant image URL found
        for (const imageUrl of imageUrls) {
            const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
            log(LogLevel.INFO, `Processing image: ${filename}`);

            try {
                // 5a. Fetch the single image
                // Modify fetchImages or create fetchImage - assuming fetchImages can handle single URL
                const imageBuffers = await fetchImages([imageUrl]); // Fetch as array of one
                if (imageBuffers.length === 0) {
                    log(LogLevel.ERROR, `Failed to fetch image: ${filename}`);
                    continue; // Skip to next image
                }
                const imageBuffer = imageBuffers[0];
                // Add explicit check to satisfy TypeScript, although logically covered by length check
                if (!imageBuffer) {
                     log(LogLevel.ERROR, `Image buffer is unexpectedly undefined for: ${filename}`);
                     continue; // Skip to next image
                }
                log(LogLevel.DEBUG, `Successfully fetched image: ${filename}`);

                // 5b. Prepare post content for this image
                const postText = `NADOCast Tornado Forecast\nRun: ${latestRun.runId}\nImage: ${filename}\nSource: ${config.monitorUrl}`;
                const altText = `NADOCast tornado probability forecast for run ${latestRun.runId}. Image: ${filename}.`;

                // 5c. Notify Bluesky for this single image
                // We will modify notifyBluesky to accept single image buffer and alt text
                log(LogLevel.INFO, `Attempting to post image ${filename} to Bluesky...`);
                // Pass the single buffer and alt text in arrays as expected by notifyBluesky
                await notifyBluesky(postText, [imageBuffer], [altText]);
                log(LogLevel.INFO, `Successfully posted image ${filename} to Bluesky.`);
                // Mark success if at least one post works (variable removed as state is updated regardless)

                // Optional: Add a small delay between posts if needed
                // await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

            } catch (postError: any) {
                log(LogLevel.ERROR, `Failed to process or post image ${filename}: ${postError.message}`);
                // Continue to the next image even if one fails
            }
        }

        // 6. Update state ONLY if the run was processed (even if some individual posts failed)
        // This prevents reprocessing the same run ID.
        // Alternatively, only update if postedSuccessfully is true, but that risks missing future runs if the first attempt fails partially.
        // Let's update regardless, as the run *was* detected and processed.
        await writeLastProcessedRunId(latestRun.runId);
        log(LogLevel.INFO, `Finished processing run ${latestRun.runId}. State updated.`);

        // Skip original steps 7 & 8 as they are now inside the loop
        isProcessing = false; // Release lock earlier as the main processing loop is done
        return; // Exit function here as processing is complete for this run


        // Steps 7 & 8 are now handled within the loop above.

    } catch (error: any) {
        log(LogLevel.ERROR, 'An error occurred during the checkNadocast process:', error.message);
        if (error.stack) {
             log(LogLevel.DEBUG, error.stack);
        }
        // Do not update state on error, allow retry
    } finally {
        isProcessing = false;
        log(LogLevel.INFO, 'NADOCast check finished.');
    }
}

/**
 * Initializes and runs the monitor loop.
 */
async function runMonitor(): Promise<void> {
    log(LogLevel.INFO, `NADOCast Monitor starting...`);
    log(LogLevel.INFO, `Check interval: ${config.checkIntervalMinutes} minutes.`); // Use checkIntervalMinutes
    log(LogLevel.INFO, `Log level set to: ${config.logLevel.toUpperCase()}`);

    // Perform an initial check immediately on startup
    await checkNadocast();

    // Set up the interval timer
    const checkIntervalMillis = config.checkIntervalMinutes * 60 * 1000; // Use checkIntervalMinutes
    setInterval(checkNadocast, checkIntervalMillis); // Use checkIntervalMillis

    log(LogLevel.INFO, `Monitor is running. Will check every ${config.checkIntervalMinutes} minutes.`); // Use checkIntervalMinutes
}

// --- Start the monitor ---
runMonitor().catch(error => {
    log(LogLevel.ERROR, 'Failed to start the monitor:', error);
    process.exit(1); // Exit if initialization fails
});