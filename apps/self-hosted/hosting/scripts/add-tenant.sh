#!/bin/bash
# Add a new tenant to the hosting platform

set -e

USERNAME=$1
PLAN=${2:-standard}

if [ -z "$USERNAME" ]; then
    echo "Usage: $0 <hive-username> [plan]"
    echo "  plan: standard (default) or pro"
    exit 1
fi

CONFIG_DIR="${CONFIG_DIR:-./configs}"
CONFIG_FILE="${CONFIG_DIR}/${USERNAME}.json"

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

# Check if tenant already exists
if [ -f "$CONFIG_FILE" ]; then
    echo "Tenant ${USERNAME} already exists"
    exit 1
fi

# Create config from template
cat > "$CONFIG_FILE" << EOJSON
{
  "version": 1,
  "configuration": {
    "general": {
      "theme": "system",
      "styleTemplate": "medium",
      "language": "en",
      "imageProxy": "https://i.ecency.com",
      "profileBaseUrl": "https://ecency.com/@",
      "createPostUrl": ""
    },
    "instanceConfiguration": {
      "type": "blog",
      "username": "${USERNAME}",
      "meta": {
        "title": "${USERNAME}'s Blog",
        "description": "A Hive blockchain blog"
      },
      "features": {
        "auth": {
          "enabled": true,
          "methods": ["keychain", "hivesigner", "hiveauth"]
        }
      }
    }
  }
}
EOJSON

echo "Created tenant: ${USERNAME}"
echo "Blog URL: https://${USERNAME}.blogs.ecency.com"
echo "Config file: ${CONFIG_FILE}"
