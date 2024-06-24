#!/bin/bash

# Source directory passed as an argument
SOURCE_DIR=$1

# Target base directory passed as an argument
TARGET_BASE=$2

MAX_SIZE=$((500*1024*1024*1024))  # 500GB in bytes
MIN_SIZE=$((550*1024*1024*1024))  # 550GB in bytes
LOGFILE="split_log.txt"
PROCESSED_LOG="processed_folders.txt"

# Function to find the next available folder number
get_next_folder_number() {
    local num=1800
    while [[ -d "${TARGET_BASE}/01-${num}" ]]; do
        num=$((num + 1))
    done
    echo $num
}

# Function to check if a folder has already been processed
has_been_processed() {
    local folder=$1
    grep -q "^${folder}$" $PROCESSED_LOG
    return $?
}

FOLDER_NUMBER=$(get_next_folder_number)

mkdir -p "${TARGET_BASE}/01-${FOLDER_NUMBER}"
touch $PROCESSED_LOG

for folder in "${SOURCE_DIR}"/*/; do
    if has_been_processed "$folder"; then
        echo "$folder has already been processed. Skipping."
        continue
    fi

    FOLDER_SIZE=$(du -sb "${folder}" | cut -f1)
    if [[ $FOLDER_SIZE -lt $MIN_SIZE ]]; then
        echo "$folder is smaller than the minimum size. Skipping."
        echo "Skipped ${folder} due to size < 550GB" >> $LOGFILE
        continue
    fi

    if [[ $((CURRENT_SIZE + FOLDER_SIZE)) -le $MAX_SIZE ]]; then
        echo "Moving ${folder} to ${TARGET_BASE}/01-${FOLDER_NUMBER}/" >> $LOGFILE
        mv "${folder}" "${TARGET_BASE}/01-${FOLDER_NUMBER}/"
        CURRENT_SIZE=$((CURRENT_SIZE + FOLDER_SIZE))
    else
        FOLDER_NUMBER=$(get_next_folder_number)
        echo "Creating folder: ${TARGET_BASE}/01-${FOLDER_NUMBER}" >> $LOGFILE
        mkdir "${TARGET_BASE}/01-${FOLDER_NUMBER}"
        echo "Moving ${folder} to ${TARGET_BASE}/01-${FOLDER_NUMBER}/" >> $LOGFILE
        mv "${folder}" "${TARGET_BASE}/01-${FOLDER_NUMBER}/"
        CURRENT_SIZE=$FOLDER_SIZE
    fi
    # Mark the folder as processed
    echo "${folder}" >> $PROCESSED_LOG
done