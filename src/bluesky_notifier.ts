import { BskyAgent, RichText, AtpAgentLoginOpts, ComAtprotoRepoUploadBlob } from '@atproto/api';
import config from './config';
// URL class is typically globally available in Node.js, no explicit import needed here.

const MAX_POST_LENGTH = 300; // Bluesky character limit
const MAX_IMAGES_PER_POST = 4;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

interface UploadedImage {
    image: ComAtprotoRepoUploadBlob.OutputSchema; // Type for uploaded blob reference
    altText: string;
}

// Initialize the BskyAgent
const agent = new BskyAgent({ service: config.pdsUrl }); // Use pdsUrl

/**
 * Logs into Bluesky using credentials from config.
 * @throws Error if login fails after retries.
 */
async function login(): Promise<void> {
    console.log(`Attempting to log into Bluesky service: ${config.pdsUrl}`); // Use pdsUrl
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            const loginOpts: AtpAgentLoginOpts = {
                identifier: config.blueskyHandle, // Use blueskyHandle
                password: config.blueskyAppPassword, // Use blueskyAppPassword
            };
            await agent.login(loginOpts);
            console.log(`Successfully logged into Bluesky as ${config.blueskyHandle}`); // Use blueskyHandle
            return; // Success
        } catch (error: any) {
            attempts++;
            console.error(`Bluesky login attempt ${attempts} failed:`, error.message);
            if (attempts >= MAX_RETRIES) {
                throw new Error(`Failed to log into Bluesky after ${MAX_RETRIES} attempts: ${error.message}`);
            }
            console.log(`Retrying login in ${RETRY_DELAY_MS / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
}

/**
 * Uploads image buffers to Bluesky blob store.
 * @param images An array of Buffers containing image data.
 * @param altTexts An array of alt text strings corresponding to the images.
 * @returns A Promise resolving to an array of UploadedImage objects.
 * @throws Error if upload fails for any image after retries.
 */
async function uploadImages(images: Buffer[], altTexts: string[]): Promise<UploadedImage[]> {
    if (images.length === 0) {
        return [];
    }
    if (images.length > MAX_IMAGES_PER_POST) {
        console.warn(`Too many images (${images.length}), only the first ${MAX_IMAGES_PER_POST} will be uploaded.`);
        images = images.slice(0, MAX_IMAGES_PER_POST);
        altTexts = altTexts.slice(0, MAX_IMAGES_PER_POST);
    }
     if (images.length !== altTexts.length) {
        console.warn(`Mismatch between image count (${images.length}) and alt text count (${altTexts.length}). Using generic alt text where needed.`);
        // Pad altTexts if necessary
        altTexts = altTexts.concat(Array(images.length - altTexts.length).fill('Nadocast forecast image'));
    }


    console.log(`Uploading ${images.length} images to Bluesky...`);
    const uploadedImages: UploadedImage[] = [];

    for (let i = 0; i < images.length; i++) {
        const imageBuffer = images[i];
        const altText = altTexts[i] || 'Nadocast forecast image'; // Default alt text
        let attempts = 0;
        let success = false;

        while (attempts < MAX_RETRIES && !success) {
            try {
                console.log(`Uploading image ${i + 1}/${images.length} (attempt ${attempts + 1})...`);
                const response = await agent.uploadBlob(imageBuffer, {
                    encoding: 'image/png' // Assuming PNG, adjust if needed
                });
                console.log(`Successfully uploaded image ${i + 1}. CID: ${response.data.blob.ref.toString()}`);
                uploadedImages.push({ image: response.data, altText: altText });
                success = true; // Mark as successful
            } catch (error: any) {
                attempts++;
                console.error(`Failed to upload image ${i + 1} (attempt ${attempts}):`, error.message);
                if (attempts >= MAX_RETRIES) {
                    throw new Error(`Failed to upload image ${i + 1} after ${MAX_RETRIES} attempts: ${error.message}`);
                }
                console.log(`Retrying image upload in ${RETRY_DELAY_MS / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }
    console.log(`Finished uploading ${uploadedImages.length} images.`);
    return uploadedImages;
}

/**
 * Creates a post (skeet) on Bluesky with text and optional image embeds.
 * @param text The text content of the post.
 * @param images An array of UploadedImage objects from uploadImages.
 * @throws Error if posting fails after retries.
 */
async function createPost(text: string, images: UploadedImage[]): Promise<void> {
    console.log('Preparing post for Bluesky...');

    let postText = text;
    // Truncate text if it exceeds the limit BEFORE creating RichText
    if (postText.length > MAX_POST_LENGTH) {
        console.warn(`Post text exceeds ${MAX_POST_LENGTH} characters. Truncating...`);
        postText = postText.slice(0, MAX_POST_LENGTH - 3) + '...';
    }

    // Use RichText to handle formatting and links automatically AFTER potential truncation
    const rt = new RichText({ text: postText });
    await rt.detectFacets(agent); // Auto-detects mentions and links

    const postRecord: any = {
        $type: 'app.bsky.feed.post',
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
        langs: ['en'] // Assuming English, adjust if needed
    };

    // Add image embeds if present
    if (images.length > 0) {
        postRecord.embed = {
            $type: 'app.bsky.embed.images',
            images: images.map((img: UploadedImage) => ({
                image: img.image.blob, // Reference the uploaded blob
                alt: img.altText,
                aspectRatio: undefined // Let Bluesky determine aspect ratio if possible
            }))
        };
        console.log(`Attaching ${images.length} images to the post.`);
    }

    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            console.log(`Attempting to create post (attempt ${attempts + 1})...`);
            const response = await agent.post(postRecord);
            console.log(`Successfully created post! URI: ${response.uri}`);
            return; // Success
        } catch (error: any) {
            attempts++;
            console.error(`Failed to create post (attempt ${attempts}):`, error.message);
             // Check for specific rate limit errors if the API provides them
            if (error.message && error.message.includes('RateLimitExceeded')) {
                 console.warn('Rate limit exceeded. Waiting longer before retry...');
                 await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 5)); // Longer delay for rate limits
            } else if (attempts < MAX_RETRIES) {
                console.log(`Retrying post creation in ${RETRY_DELAY_MS / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                 throw new Error(`Failed to create post after ${MAX_RETRIES} attempts: ${error.message}`);
            }
        }
    }
}

/**
 * Main function to notify Bluesky with text and images.
 * Handles login, image upload, and post creation.
 * @param postText The text for the Bluesky post.
 * @param imageBuffers An array of Buffers containing image data.
 * @param altTexts An array of alt text strings for the images.
 * @returns A Promise resolving when the notification is successfully sent.
 * @throws Error if any step fails after retries.
 */
export async function notifyBluesky(postText: string, imageBuffers: Buffer[], altTexts: string[]): Promise<void> {
    try {
        // Ensure logged in (agent might persist session, but good to check/re-login if needed)
        if (!agent.session) {
            await login();
        } else {
            console.log("Already logged into Bluesky.");
            // Optional: Add session refresh logic if needed
        }

        // Upload images
        const uploadedImages = await uploadImages(imageBuffers, altTexts);

        // Create the post
        await createPost(postText, uploadedImages);

        console.log('Bluesky notification process completed successfully.');

    } catch (error) {
        console.error('Bluesky notification failed:', error);
        // Re-throw the error to be handled by the main loop
        throw error;
    }
}