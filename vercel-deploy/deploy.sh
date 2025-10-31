#!/bin/bash

# Quick deployment script for Jounce apps to Vercel

echo "🏌️ Deploying Golf Scorecard to Vercel..."
echo ""

# Check if vercel is installed
if ! command -v vercel &> /dev/null
then
    echo "❌ Vercel CLI not found!"
    echo "Install it with: npm install -g vercel"
    exit 1
fi

echo "✅ Vercel CLI found"
echo ""

# Deploy
echo "🚀 Deploying..."
vercel --prod

echo ""
echo "✨ Deployment complete!"
echo ""
echo "Share this link with your friend! ⛳"
