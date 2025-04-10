import axios from 'axios';

/**
 * Fetches image data from a given URL.
 * @param imageUrl The URL of the image to download.
 * @returns A Promise resolving to the image data as a Buffer.
 * @throws Error if the download fails or the response is not an image.
 */
export async function fetchImage(imageUrl: string): Promise<Buffer> {
    try {
        console.log(`Fetching image from: ${imageUrl}`);
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer', // Crucial for getting binary data
            headers: {
                'User-Agent': 'NadocastMonitorBot/1.0 (+https://github.com/your-repo)',
                'Accept': 'image/png,image/jpeg,image/*' // Be explicit about expected content
            },
            timeout: 20000 // 20 second timeout for potentially larger files
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        // Optional: Basic check if the content type looks like an image
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            console.warn(`URL ${imageUrl} did not return an image content-type (got: ${contentType}). Proceeding anyway.`);
            // Depending on strictness, you might throw an error here
        }

        console.log(`Successfully fetched image from: ${imageUrl} (${response.data.length} bytes)`);
        // Ensure the data is a Buffer
        return Buffer.from(response.data);

    } catch (error: any) {
        console.error(`Error fetching image ${imageUrl}:`, error.message);
        // Include response details if available (e.g., from AxiosError)
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            // Avoid logging potentially large response data directly
        }
        throw new Error(`Failed to fetch image from ${imageUrl}: ${error.message}`);
    }
}

/**
 * Fetches multiple images concurrently.
 * @param imageUrls An array of image URLs to download.
 * @returns A Promise resolving to an array of Buffers, one for each successfully downloaded image.
 *          If an image fails to download, the error is logged, and it's omitted from the result.
 */
export async function fetchImages(imageUrls: string[]): Promise<Buffer[]> {
    console.log(`Fetching ${imageUrls.length} images...`);
    const imagePromises = imageUrls.map(url =>
        fetchImage(url).catch(error => {
            // Log the error but don't let one failed image stop others
            console.error(`Skipping image due to error: ${error.message}`);
            return null; // Return null for failed downloads
        })
    );

    const results = await Promise.all(imagePromises);

    // Filter out null results (failed downloads) and assert non-null type
    const successfulImages = results.filter((result): result is Buffer => result !== null);

    console.log(`Successfully fetched ${successfulImages.length} out of ${imageUrls.length} images.`);
    return successfulImages;
}