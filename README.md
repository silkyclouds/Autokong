<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
</head>
<body>

<h1>AutoKong: Automate SongKong Music Management Tasks</h1>

<img src="Autokong.gif" alt="AutoKong GIF" width="600">

<h2>Introduction</h2>
<p>AutoKong is a script designed to automate the tasks of the SongKong music management application. SongKong is a powerful tool for managing and organizing your music library. However, processing large folders can be cumbersome and may lead to memory overloads and other issues. AutoKong helps by automating SongKong tasks, ensuring large folders are split into manageable sizes before processing, and providing flexibility in task execution.</p>

<h2>Features</h2>
<ul>
    <li><strong>Automates SongKong Tasks:</strong> Automates the following SongKong tasks:
        <ul>
            <li>Matching songs to MusicBrainz</li>
            <li>Matching songs to Bandcamp</li>
            <li>Deleting duplicate songs</li>
            <li>Renaming and moving songs</li>
        </ul>
    </li>
    <li><strong>Handles Large Folders:</strong> Splits large folders into subfolders of up to 500GB before processing to avoid memory overload and unexpected issues when running SongKong on terabytes of music.</li>
    <li><strong>Tracks Processed Folders:</strong> Maintains a log of processed folders to avoid reprocessing. Users have the option to reprocess already processed folders if desired.</li>
    <li><strong>Notifications:</strong> Optional notifications via Pushover and Discord.</li>
</ul>

<h2>Prerequisites</h2>
<ul>
    <li><strong>SongKong via Docker:</strong> Ensure you have SongKong installed and running via Docker.</li>
    <li><strong>Profile Configuration:</strong> Configure SongKong for each task and save the profiles in the <code>Prefs</code> folder. Run SongKong at least once on a single album to generate these profiles. The choices applied by users are personal, so it's essential to know exactly what settings you want to apply before running AutoKong.</li>
</ul>

<h2>Configuration</h2>

<h3>Docker and Folder Paths</h3>
<ul>
    <li><code>DOCKER_IMAGE_NAME</code>: Docker image name for SongKong.</li>
    <li><code>HOST_SONGKONG_VOLUME</code>: Path to the SongKong volume on the host.</li>
    <li><code>HOST_MUSIC_VOLUME</code>: Path to the music volume on the host.</li>
    <li><code>CONTAINER_SONGKONG_VOLUME</code>: Path to the SongKong volume in the container.</li>
    <li><code>CONTAINER_MUSIC_VOLUME</code>: Path to the music volume in the container.</li>
</ul>

<h3>Notifications</h3>
<ul>
    <li><strong>Pushover:</strong> Configure <code>pushover_user_key</code> and <code>pushover_api_token</code> for Pushover notifications (optional).</li>
    <li><strong>Discord:</strong> Configure <code>DISCORD_WEBHOOK_URL</code> for Discord notifications (optional).</li>
</ul>

<h3>Task Profiles</h3>
<p><code>PROPERTIES</code>: Paths to the SongKong profile files for each task.</p>

<pre><code># Configuration
DOCKER_IMAGE_NAME = "songkong/songkong"
HOST_SONGKONG_VOLUME = "/mnt/cache/appdata/songkong"
HOST_MUSIC_VOLUME = "/path/to/your/music"
CONTAINER_SONGKONG_VOLUME = "/songkong"
CONTAINER_MUSIC_VOLUME = "/music"
pushover_user_key = ""  # OPTIONAL: Enter your Pushover user key
pushover_api_token = ""  # OPTIONAL: Enter your Pushover API token
DISCORD_WEBHOOK_URL = ""  # OPTIONAL: Enter your Discord webhook URL
NOTIFICATION_INTERVAL_MINUTES = 60
FULL_REPORTING = True  # Change to True for full reporting
SEND_INTERMEDIATE_NOTIFICATIONS = False  # Set to False to disable intermediate notifications
RUN_FOLDERS_SPLIT_BASH_SCRIPT = False  # Change to False if you do not want to run the Bash script
SERVER_IP = "192.168.3.2"  # Your usual SongKong server IP

# Global variable to store past processing times and processed folders
past_processing_times = []
processed_folders = []

# Properties for SongKong tasks
PROPERTIES = {
    "musicbrainz": "songkong_fixsongs4.properties",
    "bandcamp": "songkong_bandcamp.properties",
    "deleteduplicates": "songkong_deleteduplicates2.properties",
    "rename": "songkong_renamefiles.properties"
}
</code></pre>

<h2>Usage</h2>
<p>Run AutoKong:</p>
<pre><code>python3 Autokong.py</code></pre>
<p>Provide Input:</p>
<ul>
    <li>Folder to analyze (default: /path/to/your/music/)</li>
    <li>Split folders into 500GB subfolders (default: no)</li>
    <li>Task to execute (default: Full set of tasks)</li>
    <li>Process folders that have already been processed (default: no)</li>
    <li>Reset the list of processed folders (default: no)</li>
</ul>

<h2>Explanation of Script Functionality</h2>

<h3>Initial Setup</h3>
<p>AutoKong starts by initializing the list of processed folders from <code>processed_folders.txt</code>. If the file does not exist, it starts with an empty list.</p>

<h3>Running Tasks</h3>
<p>AutoKong executes the selected SongKong task on each subfolder within the specified folder. Tasks include matching to MusicBrainz, matching to Bandcamp, deleting duplicates, and renaming/moving files. The script ensures that the SongKong database is deleted before each task to avoid corruption from repeated runs.</p>

<h3>Task Details</h3>
<ul>
    <li><strong>Match to MusicBrainz:</strong> Matches songs to the MusicBrainz database using the specified profile.</li>
    <li><strong>Match to Bandcamp:</strong> Matches songs to the Bandcamp database using the specified profile.</li>
    <li><strong>Delete Duplicates:</strong> Deletes duplicate songs using the specified profile.</li>
    <li><strong>Rename/Move Albums:</strong> Renames and moves albums using the specified profile.</li>
</ul>
<p>Users have the flexibility to run any of these tasks individually or in sequence as specified.</p>

<h3>Notifications</h3>
<p>Notifications are sent via Pushover and Discord (if configured). If notification keys are not provided, the script will run without sending notifications, and logs must be checked manually. Logs are stored in the <code>Logs</code> folder of the SongKong volume.</p>

<h3>Progress Tracking</h3>
<p>AutoKong logs the progress of each task and maintains a summary. The summary includes the number of folders processed, remaining folders, and overall progress. It also logs the time taken for each task and calculates the estimated time for the next folder.</p>

<h3>Cleaning Up</h3>
<p>After each task, AutoKong ensures that the Docker container is stopped and logs are moved to a backup folder.</p>

<h2>Example Commands</h2>
<p>Here are some example commands and explanations:</p>

<p><strong>Run the script and analyze the default folder:</strong></p>
<pre><code>python3 Autokong.py</code></pre>

<p><strong>Analyze a specific folder:</strong></p>
<pre><code>python3 Autokong.py
Enter the folder to analyze (default: /path/to/your/music/): /path/to/your/folder
</code></pre>

<h2>Why Delete the Database?</h2>
<p>Deleting the SongKong database before each task prevents corruption caused by repeated runs of AutoKong. SongKong reads information directly from the files, so AutoKong does not depend on the SongKong database.</p>
