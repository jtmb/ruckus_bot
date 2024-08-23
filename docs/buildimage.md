# REQUIRES BUILDx
    sudo apt install docker-buildx

# Create BuildX interface and set it to use by default over docker driver
    docker buildx use $(docker buildx create --use)

# Build armv7 Specific image with armv7 tag 
    docker build --platform linux/arm/v7 -t jtmb92/ruckus-bot:armv7 .
# Build arm64 Specific image with arm64 tag 
    docker build --platform linux/arm64 -t jtmb92/ruckus-bot:arm64 .
# Build AMD64 Specific image with amd64 tag 
    docker build --platform linux/amd64 -t jtmb92/ruckus-bot:amd64 .
# Build Multiplatform image Specific image with no tag 
    docker buildx build . -t jtmb92/ruckus-bot --push --platform=linux/arm64,linux/amd64,linux/arm/v7
# Build Multiplatform image Specific image with latest tag 
    docker buildx build . -t jtmb92/ruckus-bot:latest --push --platform=linux/arm64,linux/amd64,linux/arm/v7