# REQUIRES BUILDx
    sudo apt install docker-buildx

# Create BuildX interface and set it to use by default over docker driver
    docker buildx use $(docker buildx create --use)

# Build AMD64 Specific image with amd64 tag 
    docker build --platform linux/amd64 -t jtmb92/ruckus-bot:amd64 .
# Build Multiplatform image Specific image with latest tag 
    docker buildx build . -t jtmb92/ruckus-bot:latest --push --platform=linux/amd64