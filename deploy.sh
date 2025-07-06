#!/bin/bash

echo "🚀 Starting Vercel Deployment..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null
then
    echo "❌ Vercel CLI not found. Installing..."
    npm i -g vercel
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build Convex if CONVEX_DEPLOY_KEY is set
if [ ! -z "$CONVEX_DEPLOY_KEY" ]; then
    echo "🔥 Deploying Convex functions..."
    npx convex deploy --prod
else
    echo "⚠️  Skipping Convex deployment (CONVEX_DEPLOY_KEY not set)"
fi

# Deploy to Vercel
echo "🎯 Deploying to Vercel..."
if [ "$1" == "--prod" ]; then
    vercel --prod
else
    vercel
fi

echo "✅ Deployment complete!"