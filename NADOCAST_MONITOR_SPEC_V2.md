# NADOCast Tornado Forecast Monitor - Specification v2.0

## 1. Overview

This document outlines the specifications for a monitoring tool that checks the NADOCast data server for new tornado forecast runs and posts notifications with relevant images to Bluesky using the AT Protocol. This version incorporates user feedback to monitor deeper directory structures and trigger notifications based on specific image file appearances within the latest forecast run directory.

## 2. Functional Requirements

### FR1: Monitor NADOCast Data Server
- The system MUST periodically check the base URL: `http://data.nadocast.com/`.
- The check frequency SHOULD be configurable (e.g., every 15 minutes).

### FR2: Detect Latest Forecast Run
- The system MUST navigate the directory structure starting from the base URL to find the latest forecast run.
- **FR2.1:** Identify the chronologically latest monthly directory (`YYYYMM/`) by parsing the HTML listing at the base URL.
- **FR2.2:** Identify the chronologically latest daily directory (`DD/`) within the latest monthly directory by parsing its HTML listing.
- **FR2.3:** Identify the chronologically latest forecast time directory (`tXXz/`) within the latest daily directory by parsing its HTML listing.
- **FR2.4:** Construct a unique identifier for the latest detected run (e.g., "YYYYMMDD_tXXz").

### FR3: State Management
- The system MUST persist the identifier of the last successfully processed forecast run.
- **FR3.1:** On startup, the system MUST read the last processed run identifier from a persistent store (e.g., a flat file `last_run.txt`). If the store is empty or doesn't exist, assume no runs have been processed.
- **FR3.2:** Before attempting to post, the system MUST compare the latest detected run identifier (FR2.4) with the stored identifier.
- **FR3.3:** After successfully posting a notification for a new run, the system MUST update the persistent store with the identifier of that run.

### FR4: Identify Tornado Forecast Images
- Within the latest detected forecast run directory (`YYYYMM/DD/tXXz/`), the system MUST identify specific tornado forecast images.
- **FR4.1:** Parse the HTML listing of the latest run directory.
- **FR4.2:** Find all `<a>` tags linking to `.png` files matching the patterns:
    - `*_conus_tornado_*.png`
    - `*_conus_sig_tornado_*.png`
- **FR4.3:** Collect the full URLs of these identified image files.

### FR5: Post to Bluesky
- The system MUST post a notification to Bluesky if a new, unprocessed forecast run is detected (FR3.2).
- **FR5.1:** If the latest detected run is newer than the stored run:
    - **FR5.1.1:** Download the image files identified in FR4.3. Handle potential download errors.
    - **FR5.1.2:** Authenticate with the Bluesky PDS (Personal Data Server) using credentials from environment variables (FR6).
    - **FR5.1.3:** Upload the downloaded images to the Bluesky PDS, obtaining references (e.g., CIDs) for each. Handle potential upload errors. Limit to a maximum of 4 images per post (Bluesky limit). Prioritize `sig_tornado` images if more than 4 are found.
    - **FR5.1.4:** Format a post message including:
        - Date and time of the forecast run (derived from the directory structure).
        - A direct link to the `tXXz` directory on `data.nadocast.com`.
        - Example: "New NADOCast tornado forecasts available for 2025-04-08 00Z run: http://data.nadocast.com/20250408/00/t00z/"
    - **FR5.1.5:** Create and send the post to Bluesky, embedding the text (FR5.1.4) and the image references (FR5.1.3). Handle potential posting errors.
    - **FR5.1.6:** If the post is successful, update the state (FR3.3).

### FR6: Configuration
- The system MUST load configuration parameters from environment variables.
- **FR6.1:** `NADOCAST_BASE_URL`: Base URL to monitor (Default: `http://data.nadocast.com/`).
- **FR6.2:** `BLUESKY_PDS_URL`: URL of the Bluesky PDS (e.g., `https://bsky.social`).
- **FR6.3:** `BLUESKY_HANDLE`: Bluesky user handle (e.g., `mybot.bsky.social`).
- **FR6.4:** `BLUESKY_APP_PASSWORD`: Bluesky application password.
- **FR6.5:** `CHECK_INTERVAL_SECONDS`: Frequency of checks in seconds (Default: 900).
- **FR6.6:** `STATE_FILE_PATH`: Path to the file storing the last processed run ID (Default: `./last_run.txt`).
- **FR6.7:** `MAX_RETRIES`: Number of retries for network operations (Default: 3).
- **FR6.8:** `RETRY_DELAY_SECONDS`: Delay between retries (Default: 5).
- The system MUST NOT contain hardcoded credentials or URLs.

### FR7: Error Handling & Logging
- The system MUST implement robust error handling and logging.
- **FR7.1:** Log informational messages for key steps (checking, run detected, posting).
- **FR7.2:** Log errors encountered during:
    - Network requests (fetching HTML, downloading images, Bluesky API calls).
    - HTML parsing.
    - File I/O (state file).
    - Bluesky authentication/posting.
- **FR7.3:** Implement a retry mechanism (with configurable attempts and delay - FR6.7, FR6.8) for potentially transient network errors during:
    - Fetching HTML from NADOCast.
    - Downloading images.
    - Uploading images to Bluesky.
    - Posting to Bluesky.

### FR8: Deployment
- The system MUST be containerizable using Docker.
- **FR8.1:** A `Dockerfile` MUST be provided to build the application image.
- **FR8.2:** Dependencies MUST be managed (e.g., `requirements.txt` for Python).

## 3. Non-Functional Requirements

### NFR1: Reliability
- The monitor should run continuously and recover from transient errors where possible.
### NFR2: Maintainability
- Code should be modular, well-commented, and follow standard coding practices.
### NFR3: Performance
- Network requests and parsing should be reasonably efficient. Avoid excessive polling.

## 4. Pseudocode Modules

---

### Module: `config.py`

```pseudocode
// TDD Anchor: Test loading defaults and overriding with env vars
// TDD Anchor: Test handling missing required env vars (handle/password/pds)

CONSTANT NADOCAST_BASE_URL = get_env_variable("NADOCAST_BASE_URL", default="http://data.nadocast.com/")
CONSTANT BLUESKY_PDS_URL = get_env_variable("BLUESKY_PDS_URL") // Required
CONSTANT BLUESKY_HANDLE = get_env_variable("BLUESKY_HANDLE") // Required
CONSTANT BLUESKY_APP_PASSWORD = get_env_variable("BLUESKY_APP_PASSWORD") // Required
CONSTANT CHECK_INTERVAL_SECONDS = integer(get_env_variable("CHECK_INTERVAL_SECONDS", default=900))
CONSTANT STATE_FILE_PATH = get_env_variable("STATE_FILE_PATH", default="./last_run.txt")
CONSTANT MAX_RETRIES = integer(get_env_variable("MAX_RETRIES", default=3))
CONSTANT RETRY_DELAY_SECONDS = integer(get_env_variable("RETRY_DELAY_SECONDS", default=5))
CONSTANT MAX_IMAGES_PER_POST = 4

FUNCTION get_env_variable(name, default=None):
    value = system_get_environment_variable(name)
    IF value IS NOT NULL:
        RETURN value
    ELSE IF default IS NOT NULL:
        RETURN default
    ELSE:
        // Handle required variables missing - maybe raise an error early
        log_error(f"Required environment variable {name} is not set.")
        exit_program(1) // Or raise ConfigurationError

// Validate required variables on import/load
IF BLUESKY_PDS_URL IS NULL OR BLUESKY_HANDLE IS NULL OR BLUESKY_APP_PASSWORD IS NULL:
    log_error("Missing required Bluesky configuration environment variables.")
    exit_program(1)

```

---

### Module: `logger.py`

```pseudocode
// TDD Anchor: Test log formatting
// TDD Anchor: Test different log levels (INFO, ERROR, WARNING)

PROCEDURE setup_logging():
    // Configure logging format (e.g., timestamp, level, message)
    // Configure output (e.g., console, file)
    // Set default log level (e.g., INFO)
    pass

PROCEDURE log_info(message):
    // Write message with INFO level
    print(f"INFO: {message}") // Simplified example

PROCEDURE log_error(message, exception=None):
    // Write message with ERROR level
    // Include exception details if provided
    print(f"ERROR: {message} {exception if exception else ''}") // Simplified example

PROCEDURE log_warning(message):
    // Write message with WARNING level
    print(f"WARNING: {message}") // Simplified example

// Call setup_logging() when module is loaded or app starts
setup_logging()
```

---

### Module: `state_manager.py`

```pseudocode
IMPORT config
IMPORT logger

// TDD Anchor: Test reading from existing file
// TDD Anchor: Test reading from non-existent file (should return None or empty)
// TDD Anchor: Test writing to file (creates/overwrites)
// TDD Anchor: Test file permissions errors (read/write)

FUNCTION read_last_processed_run():
    TRY
        IF file_exists(config.STATE_FILE_PATH):
            content = read_file_content(config.STATE_FILE_PATH).strip()
            IF content IS NOT EMPTY:
                logger.log_info(f"Read last processed run: {content}")
                RETURN content
            ELSE:
                logger.log_info("State file is empty.")
                RETURN None
        ELSE:
            logger.log_info("State file not found. Assuming first run.")
            RETURN None
    CATCH FileReadError as e:
        logger.log_error(f"Failed to read state file: {config.STATE_FILE_PATH}", e)
        RETURN None // Or raise error to halt execution if state is critical

PROCEDURE write_last_processed_run(run_identifier):
    TRY
        write_content_to_file(config.STATE_FILE_PATH, run_identifier)
        logger.log_info(f"Updated state file with run: {run_identifier}")
    CATCH FileWriteError as e:
        logger.log_error(f"Failed to write state file: {config.STATE_FILE_PATH}", e)
        // Decide if this is a critical failure
```

---

### Module: `http_client.py` (Helper for network requests with retry)

```pseudocode
IMPORT config
IMPORT logger
IMPORT time
IMPORT requests // Assuming a standard HTTP library

// TDD Anchor: Test successful request
// TDD Anchor: Test retry logic on specific error codes (e.g., 5xx)
// TDD Anchor: Test exceeding max retries
// TDD Anchor: Test non-retryable errors (e.g., 4xx)
// TDD Anchor: Test timeout handling

FUNCTION make_request(url, method="GET", stream=False, timeout=30):
    attempts = 0
    WHILE attempts <= config.MAX_RETRIES:
        attempts += 1
        TRY
            response = requests.request(method, url, timeout=timeout, stream=stream)
            response.raise_for_status() // Raise HTTPError for bad responses (4xx or 5xx)
            logger.log_info(f"Successfully fetched {url} (Status: {response.status_code})")
            RETURN response
        CATCH ConnectionError, Timeout, HTTPError as e:
            // Only retry on potentially transient errors (e.g., 5xx, timeout, connection refused)
            is_retryable = (isinstance(e, HTTPError) AND 500 <= e.response.status_code < 600) OR \
                           isinstance(e, (ConnectionError, Timeout))

            IF is_retryable AND attempts <= config.MAX_RETRIES:
                logger.log_warning(f"Attempt {attempts}/{config.MAX_RETRIES} failed for {url}: {e}. Retrying in {config.RETRY_DELAY_SECONDS}s...")
                time.sleep(config.RETRY_DELAY_SECONDS)
            ELSE:
                logger.log_error(f"Failed to fetch {url} after {attempts} attempts: {e}", e)
                RETURN None // Indicate failure
        CATCH Exception as e: // Catch other unexpected errors
             logger.log_error(f"Unexpected error fetching {url}: {e}", e)
             RETURN None // Indicate failure
    RETURN None // Should not be reached if MAX_RETRIES >= 0, but good practice

FUNCTION download_file(url, destination_path):
    response = make_request(url, stream=True)
    IF response IS None:
        RETURN False
    TRY
        WITH open(destination_path, 'wb') as f:
            FOR chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.log_info(f"Successfully downloaded {url} to {destination_path}")
        RETURN True
    CATCH IOError as e:
        logger.log_error(f"Failed to write downloaded file {destination_path}", e)
        RETURN False
    CATCH Exception as e:
        logger.log_error(f"Unexpected error downloading {url}", e)
        RETURN False

```

---

### Module: `nadocast_parser.py`

```pseudocode
IMPORT config
IMPORT logger
IMPORT http_client
FROM html_parser_library IMPORT parse_html // e.g., BeautifulSoup

// TDD Anchor: Test parsing standard Apache index page format
// TDD Anchor: Test finding latest YYYYMM directory
// TDD Anchor: Test finding latest DD directory
// TDD Anchor: Test finding latest tXXz directory
// TDD Anchor: Test handling empty directory listings
// TDD Anchor: Test handling network errors during fetch
// TDD Anchor: Test identifying specific tornado PNG files
// TDD Anchor: Test constructing full image URLs
// TDD Anchor: Test constructing run identifier

CONSTANT MONTH_DIR_REGEX = r"^\d{6}/$" // Matches "YYYYMM/" - NOTE: NADOCast actually uses YYYYMMDD/
CONSTANT DAY_DIR_REGEX = r"^\d{2}/$"   // Matches "DD/" - NOTE: NADOCast uses numeric day here
CONSTANT TIME_DIR_REGEX = r"^t\d{2}z/$" // Matches "tXXz/"
CONSTANT TORNADO_IMG_REGEX = r"_conus_(sig_)?tornado_.*\.png$" // Matches *_conus_tornado_*.png and *_conus_sig_tornado_*.png
// *** CORRECTION based on actual NADOCast structure observed ***
CONSTANT TOP_LEVEL_DIR_REGEX = r"^\d{8}/$" // Matches "YYYYMMDD/"

FUNCTION find_latest_directory_link(url, pattern_regex):
    logger.log_info(f"Fetching directory listing: {url}")
    response = http_client.make_request(url)
    IF response IS None:
        RETURN None

    html_content = response.text
    soup = parse_html(html_content)
    links = soup.find_all('a')

    candidate_dirs = []
    FOR link in links:
        href = link.get('href')
        IF href AND regex_match(pattern_regex, href):
            candidate_dirs.append(href)

    IF NOT candidate_dirs:
        logger.log_warning(f"No directories matching pattern {pattern_regex} found at {url}")
        RETURN None

    // Assuming simple string sort works for YYYYMMDD, DD (numeric), tXXz
    latest_dir = sorted(candidate_dirs, reverse=True)[0]
    logger.log_info(f"Found latest directory matching {pattern_regex}: {latest_dir}")
    RETURN url_join(url, latest_dir) // Construct full URL

FUNCTION find_latest_run():
    // FR2.1 & FR2.2 combined: Find latest YYYYMMDD/ directory at the top level
    latest_day_url = find_latest_directory_link(config.NADOCAST_BASE_URL, TOP_LEVEL_DIR_REGEX)
    IF latest_day_url IS None: RETURN None, None

    // FR2.3: Find latest tXXz/ within the YYYYMMDD/ directory
    # Note: NADOCast structure seems to be YYYYMMDD/tXXz/ directly
    latest_run_url = find_latest_directory_link(latest_day_url, TIME_DIR_REGEX)
    IF latest_run_url IS None: RETURN None, None

    // FR2.4: Construct identifier YYYYMMDD_tXXz
    // Extract parts from the URL, e.g., "http://.../20250408/t00z/"
    parts = latest_run_url.strip('/').split('/')
    time_part = parts[-1] // "t00z"
    day_month_year_part = parts[-2] // "20250408"

    run_identifier = f"{day_month_year_part}_{time_part}"
    logger.log_info(f"Latest run identified: {run_identifier} at {latest_run_url}")

    RETURN run_identifier, latest_run_url

FUNCTION find_tornado_image_urls(run_url):
    // FR4: Find relevant image files
    logger.log_info(f"Fetching image listing for run: {run_url}")
    response = http_client.make_request(run_url)
    IF response IS None:
        RETURN []

    html_content = response.text
    soup = parse_html(html_content)
    links = soup.find_all('a')

    image_urls = []
    FOR link in links:
        href = link.get('href')
        IF href AND regex_match(TORNADO_IMG_REGEX, href):
            full_img_url = url_join(run_url, href)
            image_urls.append(full_img_url)
            logger.log_info(f"Found tornado image: {full_img_url}")

    IF NOT image_urls:
        logger.log_warning(f"No tornado images found at {run_url}")

    RETURN image_urls

```

---

### Module: `bluesky_poster.py`

```pseudocode
IMPORT config
IMPORT logger
IMPORT http_client
IMPORT os
IMPORT time # Added for retry delay
FROM bluesky_sdk IMPORT Client, Post, EmbedImages, Blob # Assuming an AT Protocol SDK

// TDD Anchor: Test successful authentication
// TDD Anchor: Test authentication failure (wrong credentials)
// TDD Anchor: Test image upload success (mock response)
// TDD Anchor: Test image upload failure
// TDD Anchor: Test post creation success (mock response)
// TDD Anchor: Test post creation failure (e.g., rate limit, invalid data)
// TDD Anchor: Test message formatting
// TDD Anchor: Test handling > 4 images (prioritization)
// TDD Anchor: Test retry logic for API calls

FUNCTION authenticate_bluesky():
    TRY
        client = Client(base_url=config.BLUESKY_PDS_URL)
        client.login(config.BLUESKY_HANDLE, config.BLUESKY_APP_PASSWORD)
        logger.log_info(f"Successfully authenticated with Bluesky as {config.BLUESKY_HANDLE}")
        RETURN client
    CATCH Exception as e:
        logger.log_error("Bluesky authentication failed", e)
        RETURN None

FUNCTION upload_image(client, image_path):
    attempts = 0
    WHILE attempts <= config.MAX_RETRIES:
        attempts += 1
        TRY
            with open(image_path, 'rb') as f:
                image_data = f.read()
            # Use the SDK's uploadBlob method
            response = client.com.atproto.repo.upload_blob(image_data) # Correct SDK usage might vary
            logger.log_info(f"Successfully uploaded image {image_path}, CID: {response.blob.ref}")
            RETURN response.blob # Return the blob reference object
        CATCH Exception as e:
            logger.log_warning(f"Attempt {attempts}/{config.MAX_RETRIES} failed to upload image {image_path}: {e}")
            IF attempts < config.MAX_RETRIES: # Check before sleeping
                time.sleep(config.RETRY_DELAY_SECONDS)
            ELSE:
                logger.log_error(f"Failed to upload image {image_path} after {config.MAX_RETRIES + 1} attempts", e)
                RETURN None
    RETURN None


FUNCTION post_to_bluesky(run_identifier, run_url, image_urls):
    client = authenticate_bluesky()
    IF client IS None:
        RETURN False

    // FR5.1.1: Download images
    downloaded_image_paths = []
    temp_dir = create_temporary_directory() # Ensure cleanup
    FOR img_url in image_urls:
        filename = os.path.basename(urlparse(img_url).path) # Handle URL paths safely
        local_path = os.path.join(temp_dir, filename)
        IF http_client.download_file(img_url, local_path):
            downloaded_image_paths.append(local_path)
        ELSE:
            logger.log_error(f"Failed to download image: {img_url}")
            # Optionally continue without this image or fail the post

    IF NOT downloaded_image_paths:
        logger.log_error("No images could be downloaded. Aborting post.")
        cleanup_directory(temp_dir)
        RETURN False

    // FR5.1.3: Upload images (max 4, prioritize sig_tornado)
    uploaded_blobs = []
    # Prioritize sig_tornado images
    sorted_paths = sorted(downloaded_image_paths, key=lambda p: 'sig_tornado' not in os.path.basename(p))

    FOR img_path in sorted_paths[:config.MAX_IMAGES_PER_POST]:
        blob_ref = upload_image(client, img_path)
        IF blob_ref:
             # Create the structure expected by the embed
             uploaded_blobs.append(
                 Blob(
                     ref=blob_ref.ref,
                     mime_type='image/png', # Assuming PNG
                     size=blob_ref.size
                 )
             )
        ELSE:
            logger.log_warning(f"Skipping image {img_path} due to upload failure.")

    cleanup_directory(temp_dir) # Clean up downloaded files

    IF NOT uploaded_blobs:
        logger.log_error("No images could be uploaded. Aborting post.")
        RETURN False

    // FR5.1.4: Format message
    // Extract date/time from run_identifier (e.g., "20250408_t00z")
    date_str = run_identifier[0:8] # "20250408"
    time_str = run_identifier[9:] # "t00z"
    formatted_date = f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}" # "2025-04-08"
    formatted_time = time_str.upper() # "T00Z"

    post_text = f"New NADOCast tornado forecasts available for {formatted_date} {formatted_time} run: {run_url}"
    logger.log_info(f"Formatted post text: {post_text}")

    // FR5.1.5: Create and send post
    attempts = 0
    WHILE attempts <= config.MAX_RETRIES:
        attempts += 1
        TRY:
            # Use SDK to create post with text and image embeds
            # Correct SDK usage for embedding images:
            embed_arg = EmbedImages(images=uploaded_blobs)
            post_result = client.com.atproto.repo.create_record(
                 repo=client.me.did, # Or use handle resolved to DID
                 collection='app.bsky.feed.post',
                 record=Post(text=post_text, embed=embed_arg) # Pass the embed object
            )
            logger.log_info(f"Successfully posted to Bluesky: {post_result.uri}")
            RETURN True # Indicate success
        CATCH Exception as e:
             logger.log_warning(f"Attempt {attempts}/{config.MAX_RETRIES} failed to post to Bluesky: {e}")
             IF attempts < config.MAX_RETRIES: # Check before sleeping
                 time.sleep(config.RETRY_DELAY_SECONDS)
             ELSE:
                 logger.log_error(f"Failed to post to Bluesky after {config.MAX_RETRIES + 1} attempts", e)
                 RETURN False # Indicate failure
    RETURN False


```

---

### Module: `main_monitor.py`

```pseudocode
IMPORT config
IMPORT logger
IMPORT state_manager
IMPORT nadocast_parser
IMPORT bluesky_poster
IMPORT time
IMPORT sys

// TDD Anchor: Test main loop logic
// TDD Anchor: Test run comparison (new run found)
// TDD Anchor: Test run comparison (no new run)
// TDD Anchor: Test successful end-to-end flow (mocked dependencies)
// TDD Anchor: Test handling failure in parser
// TDD Anchor: Test handling failure in poster
// TDD Anchor: Test correct state update on success
// TDD Anchor: Test no state update on failure

PROCEDURE run_check():
    logger.log_info("Starting NADOCast check...")

    // FR2: Detect Latest Run
    latest_run_id, latest_run_url = nadocast_parser.find_latest_run()
    IF latest_run_id IS None OR latest_run_url IS None:
        logger.log_error("Failed to determine latest NADOCast run. Skipping cycle.")
        RETURN

    // FR3: State Management - Read last processed
    last_processed_run_id = state_manager.read_last_processed_run()

    // FR3.2: Compare
    IF latest_run_id == last_processed_run_id:
        logger.log_info(f"Latest run {latest_run_id} has already been processed. No action needed.")
        RETURN
    ELSE:
        logger.log_info(f"New run detected: {latest_run_id} (previously processed: {last_processed_run_id})")

        // FR4: Identify Tornado Images
        image_urls = nadocast_parser.find_tornado_image_urls(latest_run_url)
        IF NOT image_urls:
            logger.log_warning(f"No tornado images found for new run {latest_run_id}. Skipping post, but treating run as processed.")
            # Decide if we should still update state if no images are found.
            # For now, let's update state to avoid re-checking this run without images.
            state_manager.write_last_processed_run(latest_run_id)
            RETURN

        // FR5: Post to Bluesky
        post_successful = bluesky_poster.post_to_bluesky(latest_run_id, latest_run_url, image_urls)

        // FR3.3 / FR5.1.6: Update State on Success
        IF post_successful:
            state_manager.write_last_processed_run(latest_run_id)
        ELSE:
            logger.log_error(f"Failed to post notification for run {latest_run_id}. State not updated.")
            // Consider alerting mechanism here for persistent failures

PROCEDURE main():
    logger.log_info("NADOCast Monitor starting...")
    logger.log_info(f"Check interval: {config.CHECK_INTERVAL_SECONDS} seconds")
    logger.log_info(f"State file: {config.STATE_FILE_PATH}")

    WHILE True:
        TRY
            run_check()
        CATCH Exception as e:
            logger.log_error(f"Unhandled exception in main loop: {e}", e) # Include exception object
            # Avoid crashing the whole monitor on unexpected errors in a single cycle

        logger.log_info(f"Check complete. Sleeping for {config.CHECK_INTERVAL_SECONDS} seconds...")
        time.sleep(config.CHECK_INTERVAL_SECONDS)

IF __name__ == "__main__":
    # Perform any initial setup like logger configuration if not done elsewhere
    # logger.setup_logging() # Ensure logger is configured
    main()

```

---

### `Dockerfile` Outline

```dockerfile
# Use an official Python runtime as a parent image
FROM python:3.10-slim

WORKDIR /app

# Copy dependency list
COPY requirements.txt ./

# Install dependencies
# Consider using --system-site-packages if base image has some overlap
# Or use a virtual environment within the container
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY *.py /app/
# Or copy specific modules if preferred:
# COPY config.py logger.py state_manager.py http_client.py nadocast_parser.py bluesky_poster.py main_monitor.py /app/

# Set environment variables (defaults or placeholders if not using build args)
# ENV NADOCAST_BASE_URL="http://data.nadocast.com/"
# ENV CHECK_INTERVAL_SECONDS=900
# ENV STATE_FILE_PATH="/app/data/last_run.txt" # Mount volume for persistence
# ENV MAX_RETRIES=3
# ENV RETRY_DELAY_SECONDS=5
# Required variables (BLUESKY_*) should be passed at runtime, not baked in.

# Create a directory for persistent state (if using file)
# Ensure the user running the app has write permissions
RUN mkdir /app/data && chown <user>:<group> /app/data # Replace <user>:<group> as needed, often non-root

# Consider running as a non-root user for security
# USER <non-root-user>

# Define the command to run the application
CMD ["python", "main_monitor.py"]

```

---

### `requirements.txt` (Example)

```
requests>=2.25.0
beautifulsoup4>=4.9.0
atproto>=0.0.30 # Or the specific Bluesky SDK package name
lxml # Often faster for BS4 parsing
# Add any other necessary libraries