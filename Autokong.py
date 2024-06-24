import os
import subprocess
import re
from datetime import datetime, timedelta
import time
import threading
import shutil

# Check dependencies and install them if not present
try:
    import requests
    from colorama import init, Fore, Style
except ImportError:
    import subprocess
    subprocess.check_call(["pip3", "install", "requests"])
    subprocess.check_call(["pip3", "install", "colorama"])
    import requests
    from colorama import init, Fore, Style

# Initialise colorama
init(autoreset=True)

# Configuration
DOCKER_IMAGE_NAME = "songkong/songkong"
HOST_SONGKONG_VOLUME = "/path/to/your/songkong"
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

def run_folders_split_bash_script(base_folder):
    """
    Run the bash script to split folders into subfolders of up to 500GB.
    """
    script_path = "./split_script.sh"  # Path to the bash script
    target_base = HOST_MUSIC_VOLUME
    cmd = f"bash {script_path} {base_folder} {target_base}"
    log_action(f"Running folder split script: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

def get_server_url():
    """
    Returns the server URL based on the SERVER_IP configuration.
    """
    return f"http://{SERVER_IP}"

def initialize_processed_folders():
    """
    Initialize the list of processed folders from 'processed_folders.txt'.
    """
    global processed_folders
    if os.path.exists("processed_folders.txt"):
        with open("processed_folders.txt", "r") as log_file:
            processed_folders = [line.strip() for line in log_file.readlines()]
        log_action(f"Initialized processed folders from processed_folders.txt with {len(processed_folders)} entries.")
    else:
        log_action("No processed_folders.txt file found. Starting with an empty list of processed folders.")
        processed_folders = []

def log_processed_folder(folder):
    """
    Log the processed folder to 'processed_folders.txt'.
    """
    try:
        with open("processed_folders.txt", "a") as log_file:
            log_file.write(f"{folder}\n")
        log_action(f"Logged processed folder: {folder}")
    except Exception as e:
        log_action(f"Failed to log processed folder {folder}: {e}")

def calculate_eta(start_time):
    """
    Calculate the estimated time of arrival (ETA) based on past processing times.
    """
    if not past_processing_times:
        return "Unknown"
    average_time = sum(past_processing_times) / len(past_processing_times)
    remaining_time = average_time - (datetime.now() - start_time).total_seconds()
    return str(timedelta(seconds=remaining_time))

def get_progress_summary(path):
    """
    Get a summary of the overall progress of processed folders.
    """
    total_folders = len(find_all_subfolders(path))
    processed_count = len(processed_folders)
    remaining_count = total_folders - processed_count
    progress_percentage = (processed_count / total_folders) * 100
    return f"📊 Overall Progress: {processed_count}/{total_folders} folders processed ({progress_percentage:.2f}%). {remaining_count} folders remaining."

def send_pushover_notification(message):
    """
    Send a notification via Pushover.
    """
    log_action(f"Sending Pushover notification: {message}")
    if pushover_user_key and pushover_api_token:
        url = "https://api.pushover.net/1/messages.json"
        data = {
            "token": pushover_api_token,
            "user": pushover_user_key,
            "message": message
        }
        requests.post(url, data=data)

def send_discord_notification(message):
    """
    Send a notification via Discord webhook.
    """
    log_action(f"Sending Discord notification: {message}")
    data = {
        "content": message
    }
    response = requests.post(DISCORD_WEBHOOK_URL, json=data)
    if response.status_code != 204:
        log_action(f"Failed to send Discord notification: {response.text}")

def log_action(action):
    """
    Log actions and print them in the console with color.
    """
    print(Fore.GREEN + action + Style.RESET_ALL)
    with open("action_log.txt", "a") as log_file:
        log_file.write(f"{datetime.now()} - {action}\n")

def ensure_container_stopped(container_name):
    """
    Ensure that the specified Docker container is stopped and removed.
    """
    try:
        result = subprocess.run(["docker", "ps", "-q", "--filter", f"name={container_name}"], capture_output=True, text=True)
        if result.stdout.strip():
            subprocess.run(["docker", "rm", "-f", container_name])
            log_action(f"Stopped and removed container: {container_name}")
    except Exception as e:
        log_action(f"Failed to stop container {container_name}: {e}")

def delete_songkong_database():
    """
    Delete the SongKong database to avoid corruption from repeated runs.
    """
    log_action("Deleting SongKong database")
    shutil.rmtree(f"{HOST_SONGKONG_VOLUME}/Prefs/Database", ignore_errors=True)

def run_songkong_task(relative_path, task_properties, task_name, task_type, container_path, timeout=600):
    global current_folder, processing_complete
    processing_complete = False
    start_time = datetime.now()
    current_folder = relative_path.replace('/', '-').strip('-')
    container_name = f"songkong_{task_name}_{current_folder}"
    cmd = (
        f'docker run --rm --name {container_name} '
        f'-v {HOST_SONGKONG_VOLUME}:{CONTAINER_SONGKONG_VOLUME} '
        f'-v {HOST_MUSIC_VOLUME}:{CONTAINER_MUSIC_VOLUME} '
        f'{DOCKER_IMAGE_NAME} {task_type} {container_path} -p {task_properties}'
    )
    retry_count = 0
    MAX_RETRIES = 2
    database_corrupt_error = "Database /songkong/Prefs/Database appears corrupt"

    # Always delete the database before starting the task
    delete_songkong_database()

    while retry_count <= MAX_RETRIES:
        log_action(f"Executing the {task_name} command: {cmd}")
        process_output = []
        try:
            process = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            for line in process.stdout:
                print(line.strip())
                process_output.append(line.strip())
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            log_action(f"Timeout expired for {cmd}")

        error_detected = False
        for line in process_output:
            if database_corrupt_error in line:
                error_detected = True
                log_action(f"Error detected: {database_corrupt_error}. Deleting database and retrying...")
                delete_songkong_database()
                retry_count += 1
                break

        if not error_detected:
            break

    end_time = datetime.now()
    time_taken = (end_time - start_time).total_seconds()
    past_processing_times.append(time_taken)
    processed_folders.append(relative_path)

    summary_message = f"🎵 SongKong {task_name.capitalize()} Summary for folder: {relative_path} 🎵\n\n"
    total_songs = 0
    error_count = 0
    for line in process_output:
        if "Songs loaded:" in line:
            total_songs = int(re.search(r'\d+', line).group())
        if "Error" in line:
            error_count += 1
        if any(keyword in line for keyword in ["Songs loaded:", "Songs fingerprinted:", "Songs matched to MusicBrainz", "Songs matched to Discogs", "Songs matched to Bandcamp", "Songs saved", "Completed", "Errors and Warnings", "Reports"]):
            value = int(re.search(r'\d+', line).group())
            percent = (value / total_songs) * 100 if total_songs else 0
            summary_message += f"{line} ({percent:.2f}%)\n"

    summary_message += f"\n⏱ Total Time Taken: {str(timedelta(seconds=time_taken))} ⏱\n\n"
    summary_message += get_progress_summary(os.path.dirname(relative_path))
    if FULL_REPORTING:
        summary_message += f"\n🔗 Report URL: {get_server_url()}\n"
        summary_message += f"\n🔍 Estimated Time for Next Folder: {calculate_eta(start_time)}"
        summary_message += f"\n❗ Error Count: {error_count}"
        summary_message += f"\n📊 Efficiency: {total_songs/time_taken:.2f} songs/second"
        total_space, used_space, free_space = os.popen('df /mnt/user/MURRAY/Music').read().split("\n")[1].split()[1:4]
        summary_message += f"\n💾 Disk Usage: Total: {total_space}, Used: {used_space}, Free: {free_space}"

    summary_message = summary_message.replace("/songkong/Reports", get_server_url())
    processing_complete = True
    send_pushover_notification(summary_message)
    move_logs_to_backup(relative_path, end_time)
    ensure_container_stopped(container_name)

def run_songkong_rename(relative_path, container_path, timeout=600):
    """
    Run the SongKong rename task.
    """
    current_folder = relative_path.replace('/', '-').strip('-')  # Formatting for container name
    container_name = f"songkong_rename_{current_folder}"
    cmd = (
        f'docker run --rm --name {container_name} '
        f'-v {HOST_SONGKONG_VOLUME}:{CONTAINER_SONGKONG_VOLUME} '
        f'-v {HOST_MUSIC_VOLUME}:{CONTAINER_MUSIC_VOLUME} '
        f'{DOCKER_IMAGE_NAME} -f "{container_path}" -p {PROPERTIES["rename"]}'
    )
    time.sleep(60)
    log_action(f"Executing the rename command: {cmd}")

    ensure_container_stopped(container_name)  # Ensure no existing container with the same name

    # Always delete the database before starting the task
    delete_songkong_database()

    process_output = []
    try:
        process = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in process.stdout:
            print(line.strip())
            log_action(f"Rename command output: {line.strip()}")
            process_output.append(line.strip())
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        log_action(f"Timeout expired for {cmd}")

    ensure_container_stopped(container_name)

    rename_summary = extract_rename_summary("\n".join(process_output))
    if rename_summary:
        log_action(f"Rename summary generated:\n{rename_summary}")
        send_pushover_notification(f"🎵 SongKong Rename Summary for folder: {relative_path} 🎵\n\n{rename_summary}")
    else:
        log_action("No rename summary generated.")
        send_pushover_notification("No rename summary available.")

def run_songkong_delete_duplicates(relative_path, container_path, timeout=600):
    """
    Run the SongKong delete duplicates task.
    """
    current_folder = relative_path.replace('/', '-').strip('-')  # Formatting for container name
    container_name = f"songkong_delete_{current_folder}"
    cmd = (
        f'docker run --rm --name {container_name} '
        f'-v {HOST_SONGKONG_VOLUME}:{CONTAINER_SONGKONG_VOLUME} '
        f'-v {HOST_MUSIC_VOLUME}:{CONTAINER_MUSIC_VOLUME} '
        f'{DOCKER_IMAGE_NAME} -d "{container_path}" -p {PROPERTIES["deleteduplicates"]}'
    )
    time.sleep(60)
    log_action(f"Executing the delete duplicates command: {cmd}")

    ensure_container_stopped(container_name)  # Ensure no existing container with the same name

    # Always delete the database before starting the task
    delete_songkong_database()

    process_output = []
    try:
        process = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in process.stdout:
            print(line.strip())
            log_action(f"Delete duplicates command output: {line.strip()}")
            process_output.append(line.strip())
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        log_action(f"Timeout expired for {cmd}")

    ensure_container_stopped(container_name)

    delete_duplicates_summary = extract_delete_duplicates_summary("\n".join(process_output))
    if delete_duplicates_summary:
        send_pushover_notification(delete_duplicates_summary)
    else:
        log_action("No delete duplicates summary generated.")
        send_pushover_notification("No delete duplicates summary available.")

def run_songkong_bandcamp(relative_path, container_path, timeout=600):
    """
    Run the SongKong Bandcamp task.
    """
    current_folder = relative_path.replace('/', '-').strip('-')  # Formatting for container name
    container_name = f"songkong_bandcamp_{current_folder}"
    cmd = (
        f'docker run --rm --name {container_name} '
        f'-v {HOST_SONGKONG_VOLUME}:{CONTAINER_SONGKONG_VOLUME} '
        f'-v {HOST_MUSIC_VOLUME}:{CONTAINER_MUSIC_VOLUME} '
        f'{DOCKER_IMAGE_NAME} -e "{container_path}" -p {PROPERTIES["bandcamp"]}'
    )
    time.sleep(60)
    log_action(f"Executing the bandcamp command: {cmd}")

    ensure_container_stopped(container_name)  # Ensure no existing container with the same name

    # Always delete the database before starting the task
    delete_songkong_database()

    process_output = []
    try:
        process = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in process.stdout:
            print(line.strip())
            log_action(f"Bandcamp command output: {line.strip()}")
            process_output.append(line.strip())
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        log_action(f"Timeout expired for {cmd}")

    ensure_container_stopped(container_name)

    bandcamp_summary = extract_bandcamp_summary("\n".join(process_output))
    if bandcamp_summary:
        send_pushover_notification(bandcamp_summary)
    else:
        log_action("No bandcamp summary generated.")
        send_pushover_notification("No bandcamp summary available.")

def run_manual_script():
    initialize_processed_folders()
    
    while True:
        user_input = input(Fore.CYAN + f"Enter the folder to analyze (default: {HOST_MUSIC_VOLUME}/Music_dump/): " + Style.RESET_ALL)
        base_folder = user_input.strip() if user_input.strip() else f"{HOST_MUSIC_VOLUME}/Music_dump/"
        container_base_folder = base_folder.replace(HOST_MUSIC_VOLUME, CONTAINER_MUSIC_VOLUME)
        
        if os.path.exists(base_folder):
            break
        else:
            print(Fore.RED + f"Invalid folder path: {base_folder}. Please enter a valid folder path." + Style.RESET_ALL)
    
    while True:
        split_folders = input(Fore.CYAN + "Do you want to split folders into 500GB subfolders before processing? (yes/no, default: no): " + Style.RESET_ALL).strip().lower()
        if split_folders == '':
            split_folders = 'no'
        if split_folders in ['yes', 'no']:
            break
        else:
            print(Fore.RED + "Invalid choice. Please enter 'yes' or 'no'." + Style.RESET_ALL)
    
    if split_folders == 'yes':
        run_folders_split_bash_script(base_folder)
    
    while True:
        print(Fore.YELLOW + "Select the task to execute:" + Style.RESET_ALL)
        print(Fore.YELLOW + "1. Match to MusicBrainz" + Style.RESET_ALL)
        print(Fore.YELLOW + "2. Match to Bandcamp" + Style.RESET_ALL)
        print(Fore.YELLOW + "3. Delete duplicates" + Style.RESET_ALL)
        print(Fore.YELLOW + "4. Rename / Move albums" + Style.RESET_ALL)
        print(Fore.YELLOW + "5. Full set of tasks (MusicBrainz/Bandcamp/Delete duplicates and Rename)" + Style.RESET_ALL)
        
        task_choice = input(Fore.CYAN + "Enter your choice (1-5, default: 5): " + Style.RESET_ALL).strip()
        if task_choice == '':
            task_choice = '5'
        if task_choice in ['1', '2', '3', '4', '5']:
            break
        else:
            print(Fore.RED + "Invalid choice. Please enter a number between 1 and 5." + Style.RESET_ALL)
    
    while True:
        process_all = input(Fore.CYAN + "Do you want to process folders that have already been processed? (yes/no, default: no): " + Style.RESET_ALL).strip().lower()
        if process_all == '':
            process_all = 'no'
        if process_all in ['yes', 'no']:
            break
        else:
            print(Fore.RED + "Invalid choice. Please enter 'yes' or 'no'." + Style.RESET_ALL)
    
    while True:
        reset_log = input(Fore.CYAN + "Do you want to reset the list of processed folders? (yes/no, default: no): " + Style.RESET_ALL).strip().lower()
        if reset_log == '':
            reset_log = 'no'
        if reset_log in ['yes', 'no']:
            break
        else:
            print(Fore.RED + "Invalid choice. Please enter 'yes' or 'no'." + Style.RESET_ALL)
    
    if reset_log == 'yes':
        if os.path.exists("processed_folders.txt"):
            os.remove("processed_folders.txt")
            print(Fore.GREEN + "The list of processed folders has been reset." + Style.RESET_ALL)
        initialize_processed_folders()

    all_folders = sorted(find_all_subfolders(base_folder))  # Sort folders by name
    for folder in all_folders:
        full_path = os.path.join(base_folder, folder)
        container_full_path = os.path.join(container_base_folder, folder)

        if process_all == 'no' and was_folder_processed(full_path):
            continue
        
        if task_choice == '1':
            run_songkong_task(full_path, PROPERTIES["musicbrainz"], "musicbrainz", "-m", container_full_path)
            ensure_container_stopped(f"songkong_musicbrainz_{full_path.replace('/', '-').strip('-')}")
        elif task_choice == '2':
            run_songkong_task(full_path, PROPERTIES["bandcamp"], "bandcamp", "-e", container_full_path)
            ensure_container_stopped(f"songkong_bandcamp_{full_path.replace('/', '-').strip('-')}")
        elif task_choice == '3':
            run_songkong_delete_duplicates(full_path, container_full_path)
            ensure_container_stopped(f"songkong_delete_{full_path.replace('/', '-').strip('-')}")
        elif task_choice == '4':
            run_songkong_rename(full_path, container_full_path)
            ensure_container_stopped(f"songkong_rename_{full_path.replace('/', '-').strip('-')}")
        elif task_choice == '5':
            run_songkong_task(full_path, PROPERTIES["musicbrainz"], "musicbrainz", "-m", container_full_path)
            ensure_container_stopped(f"songkong_musicbrainz_{full_path.replace('/', '-').strip('-')}")
            run_songkong_task(full_path, PROPERTIES["bandcamp"], "bandcamp", "-e", container_full_path)
            ensure_container_stopped(f"songkong_bandcamp_{full_path.replace('/', '-').strip('-')}")
            run_songkong_delete_duplicates(full_path, container_full_path)
            ensure_container_stopped(f"songkong_delete_{full_path.replace('/', '-').strip('-')}")
            run_songkong_rename(full_path, container_full_path)
            ensure_container_stopped(f"songkong_rename_{full_path.replace('/', '-').strip('-')}")

        if process_all == 'no':
            log_processed_folder(full_path)
    
    if task_choice == '3' or task_choice == '5':
        run_songkong_delete_duplicates(base_folder, container_base_folder)
        ensure_container_stopped(f"songkong_delete_{base_folder.replace('/', '-').strip('-')}")
    
    send_pushover_notification("🎉 Manual script has finished processing all folders. 🎉")

def move_logs_to_backup(relative_path, end_time):
    """
    Move SongKong logs to a backup folder with a timestamp.
    """
    log_folder = f"{HOST_SONGKONG_VOLUME}/Logs/"
    backup_folder = f"{HOST_SONGKONG_VOLUME}/Logs_backup/"
    date_time_suffix = end_time.strftime("%Y%m%d_%H%M%S")
    for log_file in os.listdir(log_folder):
        new_log_file = f"{relative_path.replace('/', '_')}_{date_time_suffix}_{log_file}"
        shutil.move(os.path.join(log_folder, log_file), os.path.join(backup_folder, new_log_file))

def extract_value(pattern, text):
    """
    Extract integer value from a text using a regex pattern.
    """
    match = re.search(pattern, text)
    if match:
        return int(match.group(1).replace(',', ''))
    return 0

def extract_rename_summary(output):
    """
    Extract summary information from the rename task output.
    """
    summary_pattern = re.compile(r"(Songs Report is:.+)|(Songs loaded:\d+)|(Songs renamed:\d+)|(Completed:\d+)|(Errors and Warnings:\d+)")
    matches = summary_pattern.findall(output)
    summary_lines = [line for match in matches for line in match if line]
    summary = "\n".join(summary_lines)
    return summary

def extract_delete_duplicates_summary(output):
    """
    Extract summary information from the delete duplicates task output.
    """
    summary_pattern = re.compile(r"(Processing:\d+|Songs loaded:\d+|Duplicate groups found :\d+|Duplicate songs deleted:\d+|Errors and Warnings:\d+)")
    matches = summary_pattern.findall(output)
    summary = "\n".join([" ".join(filter(None, match)) for match in matches])
    return summary

def extract_bandcamp_summary(output):
    """
    Extract summary information from the bandcamp task output.
    """
    summary_pattern = re.compile(r"Songs Report is: (.+)|Songs loaded:(\d+)|Songs matched to Bandcamp:(\d+)|Completed:(\d+)|Errors and Warnings:(\d+)|Report Creation:(\d+)")
    matches = summary_pattern.findall(output)
    summary = "\n".join([" ".join(filter(None, match)) for match in matches])
    return summary

def find_all_subfolders(path):
    """
    Find all subfolders in the specified path.
    """
    return [folder for folder in os.listdir(path) if os.path.isdir(os.path.join(path, folder))]

def was_folder_processed(folder):
    """
    Check if a folder was already processed by reading the log file.
    """
    if not os.path.exists("processed_folders.txt"):
        return False
    with open("processed_folders.txt", "r") as log_file:
        logs = log_file.read()
        return folder in logs

if __name__ == "__main__":
    run_manual_script()
