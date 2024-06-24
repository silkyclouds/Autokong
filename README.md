# Autokong
A script for music nerds that uses Songkong

AutoKong: Automate SongKong Music Management Tasks
Introduction
AutoKong is a script designed to automate the tasks of the SongKong music management application. SongKong is a powerful tool for managing and organizing your music library. However, processing large folders can be cumbersome and may lead to memory overloads and other issues. AutoKong helps by automating SongKong tasks, ensuring large folders are split into manageable sizes before processing, and providing flexibility in task execution.

Features
Automates SongKong Tasks: Automates the following SongKong tasks:
Matching songs to MusicBrainz
Matching songs to Bandcamp
Deleting duplicate songs
Renaming and moving songs
Handles Large Folders: Splits large folders into subfolders of up to 500GB before processing to avoid memory overload and unexpected issues when running SongKong on terabytes of music.
Tracks Processed Folders: Maintains a log of processed folders to avoid reprocessing. Users have the option to reprocess already processed folders if desired.
Notifications: Optional notifications via Pushover and Discord.
Prerequisites
SongKong via Docker: Ensure you have SongKong installed and running via Docker.
Profile Configuration: Configure SongKong for each task and save the profiles in the Prefs folder. Run SongKong at least once on a single album to generate these profiles. The choices applied by users are personal, so it's essential to know exactly what settings you want to apply before running AutoKong.
Configuration
Docker and Folder Paths
DOCKER_IMAGE_NAME: Docker image name for SongKong.
HOST_SONGKONG_VOLUME: Path to the SongKong volume on the host.
HOST_MUSIC_VOLUME: Path to the music volume on the host.
CONTAINER_SONGKONG_VOLUME: Path to the SongKong volume in the container.
CONTAINER_MUSIC_VOLUME: Path to the music volume in the container.
Notifications
Pushover: Configure pushover_user_key and pushover_api_token for Pushover notifications (optional).
Discord: Configure DISCORD_WEBHOOK_URL for Discord notifications (optional).
Task Profiles
PROPERTIES: Paths to the SongKong profile files for each task.
python
Copy code
# Configuration
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
Usage
Run AutoKong:

sh
Copy code
python3 Autokong.py
Provide Input:

Folder to analyze (default: /path/to/your/music/)
Split folders into 500GB subfolders (default: no)
Task to execute (default: Full set of tasks)
Process folders that have already been processed (default: no)
Reset the list of processed folders (default: no)
Explanation of Script Functionality
Initial Setup
AutoKong starts by initializing the list of processed folders from processed_folders.txt. If the file does not exist, it starts with an empty list.

Running Tasks
AutoKong executes the selected SongKong task on each subfolder within the specified folder. Tasks include matching to MusicBrainz, matching to Bandcamp, deleting duplicates, and renaming/moving files. The script ensures that the SongKong database is deleted before each task to avoid corruption from repeated runs.

Task Details
Match to MusicBrainz: Matches songs to the MusicBrainz database using the specified profile.
Match to Bandcamp: Matches songs to the Bandcamp database using the specified profile.
Delete Duplicates: Deletes duplicate songs using the specified profile.
Rename/Move Albums: Renames and moves albums using the specified profile.
Users have the flexibility to run any of these tasks individually or in sequence as specified.

Notifications
Notifications are sent via Pushover and Discord (if configured). If notification keys are not provided, the script will run without sending notifications, and logs must be checked manually. Logs are stored in the Logs folder of the SongKong volume.

Progress Tracking
AutoKong logs the progress of each task and maintains a summary. The summary includes the number of folders processed, remaining folders, and overall progress. It also logs the time taken for each task and calculates the estimated time for the next folder.

Cleaning Up
After each task, AutoKong ensures that the Docker container is stopped and logs are moved to a backup folder.

Example Commands
Here are some example commands and explanations:

Run the script and analyze the default folder:

sh
Copy code
python3 Autokong.py
Analyze a specific folder:

sh
Copy code
python3 Autokong.py
Enter the folder to analyze (default: /path/to/your/music/): /path/to/your/folder
Why Delete the Database?
Deleting the SongKong database before each task prevents corruption caused by repeated runs of AutoKong. SongKong reads information directly from the files, so AutoKong does not depend on the SongKong database.
