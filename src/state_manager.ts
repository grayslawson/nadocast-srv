import fs from 'fs/promises';
import path from 'path';
import config from './config'; // Import config to get the state file path

const stateFilePath = config.stateFilePath;
const stateDir = path.dirname(stateFilePath);

/**
 * Ensures the directory for the state file exists.
 */
async function ensureStateDirectoryExists(): Promise<void> {
    try {
        await fs.access(stateDir);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`State directory not found (${stateDir}), creating it...`);
            try {
                await fs.mkdir(stateDir, { recursive: true });
                console.log(`State directory created successfully.`);
            } catch (mkdirError) {
                console.error(`Error creating state directory ${stateDir}:`, mkdirError);
                throw new Error(`Failed to create state directory: ${stateDir}`);
            }
        } else {
            console.error(`Error accessing state directory ${stateDir}:`, error);
            throw new Error(`Failed to access state directory: ${stateDir}`);
        }
    }
}

/**
 * Reads the last processed run ID from the state file.
 * Returns null if the file doesn't exist or is empty.
 * Throws an error for other file system issues.
 */
export async function readLastProcessedRunId(): Promise<string | null> {
    await ensureStateDirectoryExists();
    try {
        const content = await fs.readFile(stateFilePath, 'utf-8');
        const trimmedContent = content.trim();
        return trimmedContent.length > 0 ? trimmedContent : null;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`State file (${stateFilePath}) not found. Assuming no runs processed yet.`);
            return null; // File not found is a valid initial state
        } else {
            console.error(`Error reading state file ${stateFilePath}:`, error);
            throw new Error(`Failed to read state file: ${stateFilePath}`);
        }
    }
}

/**
 * Writes the given run ID to the state file, overwriting previous content.
 * Throws an error if writing fails.
 * @param runId The run ID to write (e.g., "20250408_t00z").
 */
export async function writeLastProcessedRunId(runId: string): Promise<void> {
    await ensureStateDirectoryExists();
    try {
        await fs.writeFile(stateFilePath, runId.trim(), 'utf-8');
        console.log(`Successfully updated state file (${stateFilePath}) with run ID: ${runId}`);
    } catch (error) {
        console.error(`Error writing state file ${stateFilePath}:`, error);
        throw new Error(`Failed to write state file: ${stateFilePath}`);
    }
}