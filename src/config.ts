import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Adjust path if needed

interface AppConfig {
    monitorUrl: string; // Renamed from nadocastBaseUrl
    pdsUrl: string; // Renamed from blueskyService
    blueskyHandle: string; // Renamed from blueskyIdentifier
    blueskyAppPassword: string; // Renamed from blueskyPassword
    checkIntervalMinutes: number; // Renamed from pollIntervalMinutes
    stateFilePath: string;
    logLevel: string;
}

function getEnvVariable(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            console.warn(`Environment variable ${key} not set, using default value: ${defaultValue}`);
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function getEnvVariableAsInt(key: string, defaultValue?: number): number {
    const valueStr = getEnvVariable(key, defaultValue?.toString());
    const valueInt = parseInt(valueStr, 10);
    if (isNaN(valueInt)) {
        throw new Error(`Invalid integer value for environment variable ${key}: ${valueStr}`);
    }
    return valueInt;
}

const config: AppConfig = {
    monitorUrl: getEnvVariable('MONITOR_URL', 'http://data.nadocast.com/'), // Use MONITOR_URL
    pdsUrl: getEnvVariable('PDS_URL', 'https://bsky.social'), // Use PDS_URL
    blueskyHandle: getEnvVariable('BLUESKY_HANDLE'), // Use BLUESKY_HANDLE
    blueskyAppPassword: getEnvVariable('BLUESKY_APP_PASSWORD'), // Use BLUESKY_APP_PASSWORD
    checkIntervalMinutes: getEnvVariableAsInt('CHECK_INTERVAL_MINUTES', 60), // Use CHECK_INTERVAL_MINUTES, default 60
    stateFilePath: getEnvVariable('STATE_FILE_PATH', path.resolve(__dirname, '../state/last_processed_run.txt')),
    logLevel: getEnvVariable('LOG_LEVEL', 'info'),
};

// Basic validation (can be expanded)
if (!config.monitorUrl.startsWith('http')) {
    throw new Error('Invalid MONITOR_URL format.');
}
if (!config.pdsUrl.startsWith('http')) {
    throw new Error('Invalid PDS_URL format.');
}

console.log('Configuration loaded successfully.');
console.log(`Check interval: ${config.checkIntervalMinutes} minutes.`);
console.log(`State file path: ${config.stateFilePath}`);

export default config;